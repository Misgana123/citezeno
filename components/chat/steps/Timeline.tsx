'use client';

import { Icon } from '../../Icon';
import { GroupRow, StepRow } from './StepRow';
import { heading, isResearch, isShown, planOf, planState, researchCounts, rows as toRows, type LiveStep, type Row, type WorkItem } from './timeline';

/* What the assistant did for a turn, as a timeline: a one-line heading that
   opens to the steps hanging off a thin line, with the assistant's short
   notes between them. Open while it works; folded to its heading once done.
   Deep research adds its plan (the questions, ticked off as they're done)
   and puts each question's steps under it. */

function RowView({ row }: { row: Row }) {
  if (row.kind === 'note') return <li className="ch-tl-note">{row.text}</li>;
  if (row.kind === 'step') return <StepRow step={row.step} />;
  if (row.kind === 'group') return <GroupRow kind={row.stepKind} steps={row.steps} />;
  return (
    <li className="ch-tl-part">
      <p className="ch-tl-note">
        {row.n + 1}. {row.question}
      </p>
      <ol className="ch-tl-sub">
        {row.rows.map((r, i) => (
          <RowView key={i} row={r} />
        ))}
      </ol>
    </li>
  );
}

function Plan({ steps, running }: { steps: LiveStep[]; running: boolean }) {
  const plan = planOf(steps);
  if (!plan.length) return null;
  const states = plan.map((_, n) => planState(steps, n));
  const done = states.filter((s) => s === 'done').length;
  return (
    <div className="ch-tl-plan">
      <p>Plan</p>
      <ol>
        {plan.map((q, n) => (
          <li key={n} className={`is-${states[n]}`}>
            {q}
          </li>
        ))}
      </ol>
      {running && (
        <div className="ch-tl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={done} aria-label="Questions done">
          <i style={{ width: `${Math.round((done / plan.length) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export function Timeline({ items }: { items: WorkItem[] }) {
  const steps = items.flatMap((it) => (it.kind === 'step' && isShown(it.step) ? [it.step] : []));
  if (!steps.length) return null;
  const running = steps.some((s) => s.status === 'running');
  const failed = !running && steps.some((s) => s.status === 'error');
  const research = isResearch(steps);
  const current = steps.find((s) => s.status === 'running');
  // finished deep research is named by its badge and counts alone
  const title = research ? (running ? (current?.label ?? 'Working') : null) : running ? 'Working' : heading(steps);
  const meta = research ? researchCounts(steps) : [`${steps.length} step${steps.length === 1 ? '' : 's'}`];

  return (
    <details className={`ch-tl${research ? ' is-research' : ''}`} open={running || undefined}>
      <summary className="ch-tl-head">
        {running ? <span className="ch-spin" aria-label="Working" /> : <Icon name="chevron" className="ch-tl-chev" aria-hidden="true" />}
        {research && (
          <span className="ch-tl-badge">
            <Icon name="compass" aria-hidden="true" /> Deep research
          </span>
        )}
        {title && <span className="ch-tl-heading">{title}</span>}
        {meta.length > 0 && <span className="ch-tl-count">· {meta.join(' · ')}</span>}
        {failed && <Icon name="alert" className="ch-tl-ic is-bad" aria-label="A step failed" />}
      </summary>
      {research && <Plan steps={steps} running={running} />}
      <ol className="ch-tl-line" aria-label="Steps">
        {toRows(items).map((r, i) => (
          <RowView key={r.kind === 'step' ? r.step.callId : `${r.kind}-${i}`} row={r} />
        ))}
      </ol>
    </details>
  );
}
