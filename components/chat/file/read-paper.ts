import type { Entry } from '../events';

/* The paper a turn read with ask_paper or summarize_paper (the last one): the
   [p3-2] passages in its answer belong to that paper. */
export function readPaper(parts: Entry[]): string | null {
  let id: string | null = null;
  for (const p of parts) {
    if (p.kind !== 'steps') continue;
    for (const s of p.steps) {
      const input = s.input as { paperId?: unknown } | null;
      if ((s.name === 'ask_paper' || s.name === 'summarize_paper') && typeof input?.paperId === 'string') id = input.paperId;
    }
  }
  return id;
}
