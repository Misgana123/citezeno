import type { AgentEvent } from '@/lib/agent/types';
import type { ChatEntry } from '@/lib/agent/view';
import type { LiveStep } from './Steps';

/* The conversation as the page shows it while a reply streams in. */
export type Entry = Exclude<ChatEntry, { kind: 'steps' }> | { kind: 'steps'; steps: LiveStep[] };

/* Fold one streamed event into the conversation shown. */
export function applyEvent(entries: Entry[], e: AgentEvent): Entry[] {
  const last = entries.at(-1);
  if (e.type === 'text') return [...entries, { kind: 'assistant', text: e.text }];
  if (e.type === 'step') {
    const step: LiveStep = { callId: e.callId, name: e.name, label: e.label, input: e.input, status: 'running' };
    if (last?.kind === 'steps') return [...entries.slice(0, -1), { kind: 'steps', steps: [...last.steps.filter((s) => s.callId !== e.callId), step] }];
    return [...entries, { kind: 'steps', steps: [step] }];
  }
  if (e.type === 'step_done') {
    for (let i = entries.length - 1; i >= 0; i--) {
      const en = entries[i];
      if (en.kind === 'steps' && en.steps.some((s) => s.callId === e.step.callId)) {
        const next = [...entries];
        next[i] = { kind: 'steps', steps: en.steps.map((s) => (s.callId === e.step.callId ? e.step : s)) };
        return next;
      }
    }
    if (last?.kind === 'steps') return [...entries.slice(0, -1), { kind: 'steps', steps: [...last.steps, e.step] }];
    return [...entries, { kind: 'steps', steps: [e.step] }];
  }
  return entries;
}

