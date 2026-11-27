import { json } from '@/lib/http';
import { changeAnnotationBody, newAnnotationBody } from '@/lib/reader/bodies';
import { ReaderError } from '@/lib/reader/errors';
import { readerRoute } from '@/lib/reader/route';
import { annotations, changeHighlight, changePageNote, createHighlight, createPageNote, dropAnnotation } from '@/lib/reader/service/annotations';
import { loadPaper } from '@/lib/reader/service/paper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { paperId: string };

/* The user's highlights and page notes on a paper (private to them). */
export const GET = readerRoute<P>(async ({ userId, deps }, { paperId }) => {
  const { paper } = await loadPaper(deps, userId, paperId);
  return json(await annotations(deps, userId, paper.id));
});

/* Add a highlight ({ kind: "highlight", … }) or a page note ({ kind: "note", … }). */
export const POST = readerRoute<P>(async ({ userId, deps, body }, { paperId }) => {
  const b = await body(newAnnotationBody);
  if (b.kind === 'highlight') {
    const { kind: _k, ...input } = b;
    return json(await createHighlight(deps, userId, paperId, input), 201);
  }
  const { kind: _k, ...input } = b;
  return json(await createPageNote(deps, userId, paperId, input), 201);
});

/* Change a highlight's color, note or place, or a page note's text or place. */
export const PATCH = readerRoute<P>(async ({ userId, deps, body }) => {
  const b = await body(changeAnnotationBody);
  if (b.kind === 'highlight') {
    const { kind: _k, id, ...patch } = b;
    return json({ highlight: await changeHighlight(deps, userId, id, patch) });
  }
  const { kind: _k, id, ...patch } = b;
  return json({ note: await changePageNote(deps, userId, id, patch) });
});

/* Remove one: ?kind=highlight|note&id=… */
export const DELETE = readerRoute<P>(async ({ req, userId, deps }) => {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  const id = q.get('id');
  if ((kind !== 'highlight' && kind !== 'note') || !id) throw new ReaderError('bad_request', 'Say which note to remove.');
  await dropAnnotation(deps, userId, kind, id.slice(0, 80));
  return json({ ok: true });
});
