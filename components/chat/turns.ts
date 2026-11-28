import type { AttachmentView } from '@/lib/agent/view';
import type { Entry } from './events';

/* A conversation's entries as turns (each user message with everything the
   assistant did after it), for the chat page and the shared chat page. */

/* Entries as turns: each user message with everything the assistant did after it. */
export type Turn = { key: number; user: string | null; files?: AttachmentView[]; parts: Entry[]; /* lab chats: who asked, when not you */ author?: string };

export function toTurns(entries: Entry[]): Turn[] {
  const turns: Turn[] = [];
  entries.forEach((e, i) => {
    if (e.kind === 'user') turns.push({ key: i, user: e.text, files: e.attachments, parts: [], ...('author' in e && e.author ? { author: e.author } : {}) });
    else if (turns.length) turns.at(-1)!.parts.push(e);
    else turns.push({ key: i, user: null, parts: [e] });
  });
  return turns;
}

/* A finished deep research report: the answer right after the research's "Writing the report" step. */
export function isReport(turn: Turn, at: number): boolean {
  const before = turn.parts[at - 1];
  return before?.kind === 'steps' && before.steps.some((s) => s.name === 'deep_research' && s.label === 'Writing the report' && s.status === 'done');
}

/* The titles of a turn's numbered papers, for the citation chips' tooltips. */
export function refTitles(turn: Turn): Map<number, string> {
  const m = new Map<number, string>();
  for (const p of turn.parts) {
    if (p.kind !== 'steps') continue;
    for (const s of p.steps) {
      const refs = s.display?.refs ?? {};
      for (const paper of s.display?.papers ?? []) if (refs[paper.id]) m.set(refs[paper.id], paper.title);
      for (const item of s.display?.items ?? []) if (refs[item.paper.id]) m.set(refs[item.paper.id], item.paper.title);
    }
  }
  return m;
}
