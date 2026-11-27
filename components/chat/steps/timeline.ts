import type { StepKind, StepLine } from '@/lib/agent/tools/types';
import type { StepView } from '@/lib/agent/types';

/* What the assistant did for one turn, as the chat's timeline shows it: its
   steps in order, its short notes between them, steps of one kind that ran
   one after another joined into one row ("Read 3 sources"), and in deep
   research the steps under the plan question they looked into. Plain data,
   so it is the same live and when a chat is reopened. */

export type LiveStep = Omit<StepView, 'status'> & { status: StepView['status'] | 'running' };

/* A part of a turn: a step, or the assistant's words before or between steps. */
export type WorkItem = { kind: 'step'; step: LiveStep } | { kind: 'note'; text: string };

export type Row =
  | { kind: 'note'; text: string }
  | { kind: 'step'; step: LiveStep }
  /* two or more steps of one kind, one after another */
  | { kind: 'group'; stepKind: StepKind; steps: LiveStep[] }
  /* deep research: one plan question and the steps that looked into it */
  | { kind: 'part'; n: number; question: string; rows: Row[] };

/* The offer of deep research shows as a button under the answer, not as work done. */
export const isShown = (s: LiveStep) => s.name !== 'offer_deep_research';

export const isResearch = (steps: LiveStep[]) => steps.some((s) => s.name === 'deep_research');

/* Words before a step longer than this are an answer, not a note: they stay in view. */
export const NOTE_MAX = 320;

type Part = { kind: 'steps'; steps: LiveStep[] } | { kind: 'assistant'; text: string } | { kind: string };

/* A turn's parts in order, as what to show: runs of work (steps and the
   notes between them) and the answers. Words count as a note only when
   steps the user sees come after them. */
export type Segment = { kind: 'work'; at: number; items: WorkItem[] } | { kind: 'answer'; at: number };

export function segments(parts: Part[]): Segment[] {
  const shown = (p: Part) => p.kind === 'steps' && (p as { steps: LiveStep[] }).steps.some(isShown);
  let last = -1;
  parts.forEach((p, i) => shown(p) && (last = i));
  const out: Segment[] = [];
  let work: Extract<Segment, { kind: 'work' }> | null = null;
  const into = (at: number) => {
    if (!work) out.push((work = { kind: 'work', at, items: [] }));
    return work;
  };
  parts.forEach((p, i) => {
    if (p.kind === 'steps') into(i).items.push(...(p as { steps: LiveStep[] }).steps.map((step) => ({ kind: 'step' as const, step })));
    else if (p.kind === 'assistant') {
      const text = (p as { text: string }).text.trim();
      if (i < last && text.length <= NOTE_MAX) {
        if (text) into(i).items.push({ kind: 'note', text });
      } else {
        work = null;
        out.push({ kind: 'answer', at: i });
      }
    }
  });
  return out;
}

/* Kinds whose steps, one after another, join into one row. */
const JOINED: ReadonlySet<StepKind> = new Set(['papers', 'web', 'read', 'trace']);

/* Rows for a list of items: runs of the same joinable kind become groups. */
function join(items: WorkItem[]): Row[] {
  const rows: Row[] = [];
  for (const it of items) {
    if (it.kind === 'note') {
      rows.push(it);
      continue;
    }
    const s = it.step;
    const prev = rows.at(-1);
    if (s.kind && JOINED.has(s.kind) && prev) {
      if (prev.kind === 'group' && prev.stepKind === s.kind) {
        prev.steps.push(s);
        continue;
      }
      if (prev.kind === 'step' && prev.step.kind === s.kind) {
        rows[rows.length - 1] = { kind: 'group', stepKind: s.kind, steps: [prev.step, s] };
        continue;
      }
    }
    rows.push({ kind: 'step', step: s });
  }
  return rows;
}

/* The questions deep research looked into: its plan, then the follow-ups it added. */
export function planOf(steps: LiveStep[]): string[] {
  return steps.flatMap((s) => (s.name === 'deep_research' ? (s.display?.plan ?? []) : []));
}

/* The timeline's rows. In deep research the plan itself is shown above the
   rows, so its step isn't a row, and each question's steps sit under it. */
export function rows(items: WorkItem[]): Row[] {
  const visible = items.filter((it) => it.kind === 'note' || isShown(it.step));
  const steps = visible.flatMap((it) => (it.kind === 'step' ? [it.step] : []));
  if (!isResearch(steps)) return join(visible);
  const plan = planOf(steps);
  const out: (WorkItem | { kind: 'part'; n: number; items: WorkItem[] })[] = [];
  const parts = new Map<number, { kind: 'part'; n: number; items: WorkItem[] }>();
  for (const it of visible) {
    if (it.kind === 'step' && it.step.name === 'deep_research' && it.step.label === 'Planning the research' && it.step.status === 'done') continue;
    const n = it.kind === 'step' ? it.step.part : undefined;
    if (n == null) {
      out.push(it);
      continue;
    }
    let part = parts.get(n);
    if (!part) {
      part = { kind: 'part', n, items: [] };
      parts.set(n, part);
      out.push(part);
    }
    part.items.push(it);
  }
  const result: Row[] = [];
  let loose: WorkItem[] = [];
  const flush = () => {
    result.push(...join(loose));
    loose = [];
  };
  for (const x of out) {
    if (x.kind !== 'part') {
      loose.push(x);
      continue;
    }
    flush();
    result.push({ kind: 'part', n: x.n, question: plan[x.n] ?? `Question ${x.n + 1}`, rows: join(x.items) });
  }
  flush();
  return result;
}

/* Where each plan question is: still to do, being looked into, or done. */
export function planState(steps: LiveStep[], n: number): 'todo' | 'now' | 'done' {
  const mine = steps.filter((s) => s.part === n);
  if (!mine.length) return 'todo';
  return mine.some((s) => s.status === 'running') ? 'now' : 'done';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/* A joined row's line: "Ran 3 searches", "Read 2 sources". */
export function groupLine(kind: StepKind, steps: LiveStep[]): StepLine {
  const abouts = steps.map(aboutOf).filter((a): a is string => !!a);
  const about = abouts.length ? abouts.join(' · ') : undefined;
  const n = steps.length;
  const did = kind === 'papers' ? `Ran ${plural(n, 'paper search', 'paper searches')}` : kind === 'web' ? `Ran ${plural(n, 'web search', 'web searches')}` : kind === 'read' ? `Read ${plural(n, 'source')}` : `Followed citations ${n} times`;
  return about ? { did, about } : { did };
}

/* What a step did, in a few words, for the timeline's one-line heading. */
const PHRASE: Record<StepKind, (n: number) => string | null> = {
  papers: () => 'searched papers',
  web: () => 'searched the web',
  read: (n) => `read ${plural(n, 'source')}`,
  trace: () => 'followed citations',
  shelf: () => 'checked your shelf',
  change: (n) => `made ${plural(n, 'change')} to your shelf`,
  make: (n) => `made ${plural(n, 'file')}`,
  code: () => 'ran Python',
  cite: () => 'found sources',
  plan: () => null,
};

/* The heading of a finished turn's work: "Searched papers, read 3 sources and made 1 file". */
export function heading(steps: LiveStep[]): string {
  const shown = steps.filter(isShown);
  if (!shown.length) return '';
  const counts = new Map<StepKind, number>();
  for (const s of shown) if (s.kind && s.status === 'done') counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const phrases = [...counts].map(([k, n]) => PHRASE[k](n)).filter((p): p is string => !!p);
  // rows saved before steps had kinds
  if (!phrases.length) return shown.length === 1 ? (shown[0].line?.did ?? shown[0].label) : `${shown[0].line?.did ?? shown[0].label}, and ${shown.length - 1} more`;
  const list = phrases.length > 4 ? [...phrases.slice(0, 4), 'more'] : phrases;
  const text = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return text[0].toUpperCase() + text.slice(1);
}

/* Deep research's counts for its heading: searches, sources read, sources in the report. */
export function researchCounts(steps: LiveStep[]): string[] {
  const done = steps.filter((s) => s.status === 'done');
  const searches = done.filter((s) => s.kind === 'papers' || s.kind === 'web').length;
  const read = done.filter((s) => s.kind === 'read').length;
  const report = done.find((s) => s.name === 'deep_research' && s.label === 'Writing the report');
  return [searches ? plural(searches, 'search', 'searches') : null, read ? `${plural(read, 'source')} read` : null, report?.display?.summary ?? null].filter((x): x is string => !!x);
}

/* What a step was about. A step that opened or read one thing names it by its title. */
export function aboutOf(s: LiveStep): string | undefined {
  const d = s.display;
  if (s.kind === 'read' || s.kind === 'shelf' || s.kind === 'change') {
    const one = [...(d?.papers ?? []).map((p) => p.title), ...(d?.items ?? []).map((i) => i.paper.title), ...(d?.links ?? []).map((l) => l.title)];
    if (one.length === 1 && one[0]) return one[0];
  }
  return s.line?.about;
}
