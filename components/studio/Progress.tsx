'use client';

import type { LogLine, Step, StepState } from '@/lib/engine';
import { Icon } from '../Icon';

export type StepView = Record<Step, { state: StepState; msg: string }>;

export const STEP_LABEL: Record<Step, string> = { read: 'Reading', search: 'Searching', rank: 'Ranking', format: 'Formatting' };

export function Progress({ steps, log, progress, running, onCancel }: { steps: StepView; log: LogLine[]; progress: number; running: boolean; onCancel: () => void }) {
  return (
    <section className="prog" aria-label="Tracing progress" aria-live="polite">
      <ol className="prog-steps">
        {(Object.keys(STEP_LABEL) as Step[]).map((k) => (
          <li key={k} className={`prog-step ${steps[k].state}`}>
            <span className="prog-pip" aria-hidden="true">
              {steps[k].state === 'done' ? <Icon name="check" /> : steps[k].state === 'error' ? <Icon name="x" /> : null}
            </span>
            <div>
              <b>{STEP_LABEL[k]}</b>
              <small>{steps[k].msg}</small>
            </div>
          </li>
        ))}
      </ol>
      <div className="prog-bar">
        <i style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="prog-foot">
        <ul className="prog-log">
          {log.slice(-5).map((l) => (
            <li key={l.id} className={l.error ? 'err' : l.n ? 'ok' : ''}>
              <b>{l.provider}</b>
              <span className="q">{l.query}</span>
              <span className="n">{l.error ? l.error : `${l.n} result${l.n === 1 ? '' : 's'}`}</span>
            </li>
          ))}
        </ul>
        {running && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Stop tracing
          </button>
        )}
      </div>
    </section>
  );
}
