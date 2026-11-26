import { createHash } from 'node:crypto';
import { isProviderError } from '@/lib/providers/errors';
import { readAll } from '@/lib/providers/web-files/read';
import { getPdfRow } from '@/lib/shelf/store/pdfs';
import type { ReaderDeps } from '../deps';
import { logAiCall } from '../store/ai-log';
import { passagesToEmbed, setEmbeddings } from '../store/passages';
import { claimWork, EMBED_LIMIT, markEmbedded, markFailed, markKeywordsOnly, markNoText, release, saveExtracted, setStored, type TextRow } from '../store/texts';
import { processPages } from '../text';
import { vectorSchema, vectorSql } from '../vector';
import { mayStore } from './open';

/* Background processing of a paper's text, once per PDF, in two steps:
     extract: get the PDF, read each page's text, split it into passages
     embed:   make a vector for each passage (search by meaning)
   Reading never waits for this: the reader works as soon as the PDF loads.
   A text is worked on by one worker at a time, in slices that fit a function's
   time limit; an unfinished step continues on the next run. */

export type WorkResult = 'idle' | 'extracted' | 'no_text' | 'embedded' | 'partial' | 'failed';

/* How long a worker holds a text. */
const LOCK_S = 120;
/* Wait this long before trying embeddings again after a failure (a key problem, the daily cap…). */
const EMBED_RETRY_MIN = 10;

const sharedKey = (paperId: string) => `reader/shared/${createHash('sha256').update(paperId).digest('hex').slice(0, 40)}.pdf`;

/* Why a download failed, when it is the link's fault (no point retrying soon). */
function downloadRefusal(e: unknown): string | null {
  if (!isProviderError(e)) return null;
  const reason = e.details.reason;
  return reason === 'not_pdf' || reason === 'not_found' || reason === 'too_large' || reason === 'blocked' ? reason : null;
}

async function pdfBytes(deps: ReaderDeps, t: TextRow): Promise<Uint8Array> {
  if (t.scope === 'user') {
    const row = t.ownerId && t.pdfId ? await getPdfRow(deps.db, t.ownerId, t.pdfId) : null;
    if (!row || !deps.store) throw new Error('upload_missing');
    const bytes = await deps.store.read(row.storageKey, deps.maxPdfBytes);
    if (!bytes) throw new Error('upload_missing');
    return bytes;
  }
  if (t.storageKey && deps.store) {
    const stored = await deps.store.read(t.storageKey, deps.maxPdfBytes);
    if (stored) return stored;
  }
  if (!t.sourceUrl) throw new Error('no_source');
  const file = await deps.web().fetchPdf(t.sourceUrl, { maxBytes: deps.maxPdfBytes });
  const bytes = await readAll(file.stream, deps.maxPdfBytes);
  // reusable licenses: keep one shared copy; others are never stored
  if (mayStore(t) && deps.store && !t.storageKey) {
    const key = sharedKey(t.paperId);
    try {
      await deps.store.write(key, bytes, 'application/pdf');
      await setStored(deps.db, t.id, key);
    } catch (e) {
      console.warn('[citezeno] reader: could not store a shared copy', e);
    }
  }
  return bytes;
}

async function extract(deps: ReaderDeps, t: TextRow): Promise<WorkResult> {
  let bytes: Uint8Array;
  try {
    bytes = await pdfBytes(deps, t);
  } catch (e) {
    const refused = downloadRefusal(e);
    if (refused) await markFailed(deps.db, t.id, `download:${refused}`, true);
    else if ((e as Error)?.message === 'upload_missing' || (e as Error)?.message === 'no_source') await markFailed(deps.db, t.id, (e as Error).message, true);
    else await markFailed(deps.db, t.id, `fetch:${isProviderError(e) ? e.code : 'error'}`, false);
    return 'failed';
  }
  let pages;
  try {
    pages = await deps.pages().readPages(bytes);
  } catch {
    await markFailed(deps.db, t.id, 'unreadable', true);
    return 'failed';
  }
  const done = processPages(pages);
  if (done.status === 'no_text') {
    await markNoText(deps.db, t.id, pages.pageCount);
    return 'no_text';
  }
  await saveExtracted(deps.db, t.id, { passages: done.passages, pageCount: pages.pageCount, tokenCount: done.tokenCount, next: 'embed' });
  return 'extracted';
}

async function embed(deps: ReaderDeps, t: TextRow, deadline: number): Promise<WorkResult> {
  const embedder = deps.embedder();
  const ns = embedder ? await vectorSchema(deps.db) : null;
  if (!embedder || !ns) {
    await release(deps.db, t.id);
    return 'partial';
  }
  const now = deps.now ?? Date.now;
  const v = vectorSql(ns, embedder.dimensions);
  // a user's own upload is charged (once); shared open-access papers are the owner's cost
  const meter = t.scope === 'user' && t.ownerId ? deps.embedMeter?.({ userId: t.ownerId, textId: t.id, paperId: t.paperId }) : undefined;
  let reserved = 0;
  if (meter && deps.embedAllowed && !(await deps.embedAllowed(t.ownerId!, t.id))) {
    await markKeywordsOnly(deps.db, t.id, EMBED_LIMIT);
    return 'partial';
  }
  for (;;) {
    if (now() > deadline - 5000) {
      await release(deps.db, t.id);
      return 'partial';
    }
    const batch = await passagesToEmbed(deps.db, t.id, embedder.model.maxBatch);
    if (!batch.length) break;
    if (meter) {
      const chars = batch.reduce((n, p) => n + p.text.length + (p.section?.length ?? 0) + (t.title?.length ?? 0), 0);
      reserved = ((chars / 4) * embedder.model.usdPerM) / 1_000_000;
      if (!(await meter.tryReserve(reserved))) {
        // not enough credits: questions about this upload use keyword search; it's tried again when the paper is next opened
        await markKeywordsOnly(deps.db, t.id);
        await meter.finish({ outcome: 'no_credits', useful: false });
        return 'partial';
      }
    }
    try {
      // the paper's title and the section go in front, for context
      const res = await embedder.embed('document', batch.map((p) => ({ text: p.section ? `${p.section}\n${p.text}` : p.text, title: t.title })));
      await setEmbeddings(deps.db, t.id, v.cast, batch.map((p, i) => ({ id: p.id, vector: res.vectors[i] })));
      await logAiCall(deps.db, { userId: t.ownerId, paperId: t.paperId, action: 'embed', model: embedder.model.id, inputTokens: res.tokens, outputTokens: 0, costUsd: res.costUsd });
      await meter?.record({ kind: 'embed', provider: embedder.model.provider, label: embedder.model.id, units: { tokens: res.tokens, passages: batch.length }, costUsd: res.costUsd, reservedUsd: reserved });
    } catch (e) {
      console.warn('[citezeno] reader: embedding failed, will retry later', (e as Error)?.message);
      await deps.db.query(`update reader_text set "lockedUntil" = now() + make_interval(mins => $2), attempts = 0 where id = $1`, [t.id, EMBED_RETRY_MIN]);
      return 'partial';
    }
  }
  await markEmbedded(deps.db, t.id, embedder.model.id, embedder.dimensions);
  await meter?.finish({ outcome: 'finished', useful: true });
  return 'embedded';
}

/* Work on one text (a given one, or the next waiting) until it is done or time runs out. */
export async function processNext(deps: ReaderDeps, opts: { id?: string; deadline: number }): Promise<WorkResult> {
  const canEmbed = deps.embedder() != null && (await vectorSchema(deps.db)) != null;
  const t = await claimWork(deps.db, { canEmbed, lockS: LOCK_S, id: opts.id });
  if (!t) return 'idle';
  try {
    if (t.stage === 'extract') {
      const r = await extract(deps, t);
      if (r !== 'extracted' || !canEmbed) return r;
      return embed(deps, { ...t, stage: 'embed' }, opts.deadline);
    }
    return await embed(deps, t, opts.deadline);
  } catch (e) {
    console.error('[citezeno] reader: processing failed', e);
    await markFailed(deps.db, t.id, 'error', false).catch(() => {});
    return 'failed';
  }
}
