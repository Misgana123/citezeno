'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Summary, SummaryPoint } from '@/lib/reader/store/summaries';
import { Icon } from '../../Icon';
import { ReaderApiError, readerFetch, readerUrl, type ReaderData } from '../api';
import { CiteChip } from './Cited';
import type { PassageRef } from './usePassages';

/* The paper's summary in the Details tab: Summarize when there isn't one yet,
   "Preparing paper…" while the text is processed, and then the question,
   method, findings, limits and key terms, every point linked to its passage. */

const SECTIONS: { key: 'question' | 'method' | 'findings' | 'limits'; label: string }[] = [
  { key: 'question', label: 'Question' },
  { key: 'method', label: 'Method' },
  { key: 'findings', label: 'Findings' },
  { key: 'limits', label: 'Limits' },
];

export function SummaryCard({ data, pdfId, passages, onCite }: { data: ReaderData; pdfId: string | null; passages: Map<string, PassageRef>; onCite(id: string): void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = pdfId ? `?pdf=${encodeURIComponent(pdfId)}` : '';
  const status = data.text?.status ?? null;
  const preparing = status === 'pending' || status === 'processing';

  // a saved summary shows instantly
  useEffect(() => {
    let live = true;
    readerFetch<{ summary: Summary | null }>(readerUrl(data.paper.id, `/summary${q}`))
      .then((r) => live && setSummary(r.summary))
      .catch(() => {})
      .finally(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [data.paper.id, q, status]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await readerFetch<{ summary: Summary }>(readerUrl(data.paper.id, `/summary${q}`), { method: 'POST' });
      setSummary(r.summary);
    } catch (e) {
      setError((e as ReaderApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const order = useMemo(() => (summary ? [...new Set(SECTIONS.flatMap((s) => summary.content[s.key].flatMap((p) => p.passageIds)))] : []), [summary]);

  return (
    <section className="fp-detail-sec rd-summary" aria-labelledby="rd-sum-h">
      <h3 id="rd-sum-h">Summary</h3>
      {summary ? (
        <>
          {data.paper.isRetracted && (
            <p className="rd-sum-warn">
              <Icon name="alert" /> This paper has been retracted. Don’t rely on these findings.
            </p>
          )}
          {summary.basedOn === 'abstract' && <p className="rd-sum-label">Based on the abstract only</p>}
          {SECTIONS.map(({ key, label }) =>
            summary.content[key].length ? (
              <div key={key} className="rd-sum-sec">
                <h4>{label}</h4>
                <ul>
                  {summary.content[key].map((p, i) => (
                    <Point key={i} p={p} order={order} passages={passages} onCite={onCite} />
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {summary.content.keyTerms.length > 0 && (
            <div className="rd-sum-sec">
              <h4>Key terms</h4>
              <dl className="rd-terms">
                {summary.content.keyTerms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <p className="rd-sum-foot">AI summary. Click a number to see the passage it comes from.</p>
        </>
      ) : !checked ? (
        <span className="spin" aria-label="Loading" />
      ) : !data.ai ? (
        <p className="rd-muted">AI isn’t set up yet, so summaries are off.</p>
      ) : preparing ? (
        <button type="button" className="btn btn-ghost btn-sm" disabled>
          <span className="spin" aria-hidden="true" /> Preparing paper…
        </button>
      ) : (
        <div className="rd-sum-start">
          <p>A plain-English summary: the question, method, findings, limits and key terms{status === 'ready' ? ', each linked to its passage' : ''}.</p>
          {status !== 'ready' && <p className="rd-sum-label">{data.paper.abstract ? 'There’s no text to read, so it will be based on the abstract only.' : 'There’s no text or abstract to summarize.'}</p>}
          <button type="button" className="btn btn-thread btn-sm" onClick={make} disabled={busy || (status !== 'ready' && !data.paper.abstract)}>
            {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="sparkle" />} {busy ? 'Summarizing…' : 'Summarize'}
          </button>
          {error && (
            <p className="rd-ai-error" role="alert">
              <Icon name="alert" /> {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Point({ p, order, passages, onCite }: { p: SummaryPoint; order: string[]; passages: Map<string, PassageRef>; onCite(id: string): void }) {
  return (
    <li>
      {p.text}
      {p.passageIds.map((id) => (
        <CiteChip key={id} id={id} n={order.indexOf(id) + 1} passage={passages.get(id)} onCite={onCite} />
      ))}
    </li>
  );
}
