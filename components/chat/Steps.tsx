'use client';

import type { ToolDisplay } from '@/lib/agent/tools/types';
import type { StepView } from '@/lib/agent/types';
import { Icon } from '../Icon';
import { PaperRefs } from './PaperRefs';

/* The steps the assistant took for one turn, as one compact checklist: what
   each did and how it went (with its input under Details), then what the steps
   found (a numbered reference list, sources, a file to download). */

export type LiveStep = Omit<StepView, 'status'> & { status: StepView['status'] | 'running' };

function download(file: NonNullable<ToolDisplay['file']>) {
  const url = URL.createObjectURL(new Blob([file.text], { type: `${file.mime};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function StepIcon({ status }: { status: LiveStep['status'] }) {
  if (status === 'running') return <span className="ch-spin" aria-label="Working" />;
  if (status === 'done')
    return (
      <span className="ch-ok" aria-label="Done">
        <Icon name="check" />
      </span>
    );
  return (
    <span className="ch-bad" aria-label={status === 'declined' ? 'Not done' : 'Failed'}>
      <Icon name={status === 'declined' ? 'x' : 'alert'} />
    </span>
  );
}

/* How many results a step reports, for its row. */
function count(d?: ToolDisplay): string | null {
  if (!d) return null;
  const n = (d.papers?.length ?? 0) + (d.items?.length ?? 0) + (d.sources?.length ?? 0);
  return n ? `${n} result${n === 1 ? '' : 's'}` : null;
}

export function Steps({ steps, turn }: { steps: LiveStep[]; turn: number }) {
  const papers = steps.flatMap((s) => s.display?.papers ?? []);
  const items = steps.flatMap((s) => s.display?.items ?? []);
  const refs = Object.assign({}, ...steps.map((s) => s.display?.refs ?? {})) as Record<string, number>;
  const sources = steps.flatMap((s) => s.display?.sources ?? []);
  const files = steps.flatMap((s) => (s.display?.file ? [s.display.file] : []));
  // the same paper found twice in a turn is listed once
  const seen = new Set<string>();
  const uniquePapers = papers.filter((p) => !seen.has(p.id) && seen.add(p.id));
  const uniqueItems = items.filter((i) => !seen.has(i.paper.id) && seen.add(i.paper.id));

  return (
    <div className="ch-turn-work">
      <ol className="ch-steps" aria-label="Steps">
        {steps.map((s) => (
          <li key={s.callId} className={`ch-step is-${s.status}`}>
            <StepIcon status={s.status} />
            <span className="ch-step-label">{s.status === 'declined' ? `Not done: ${s.label}` : s.label}</span>
            {s.status === 'done' && count(s.display) && <span className="ch-step-count">{count(s.display)}</span>}
            <details className="ch-step-input">
              <summary>Details</summary>
              <p className="ch-step-tool">{s.name}</p>
              <pre>{JSON.stringify(s.input, null, 2)}</pre>
            </details>
            {s.status === 'error' && s.error && <p className="ch-step-error">{s.error}</p>}
          </li>
        ))}
      </ol>

      <PaperRefs papers={uniquePapers} items={uniqueItems} refs={refs} turn={turn} />

      {sources.length > 0 && (
        <ul className="ch-sources">
          {sources.map((src, k) => (
            <li key={k}>
              <p className="ch-cite-ref">
                {src.reference} {src.retracted && <span className="ch-flag">Retracted</span>}
              </p>
              {src.link && /^https?:\/\//i.test(src.link) && (
                <a href={src.link} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" /> {src.link.replace(/^https?:\/\//, '')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {steps.some((s) => s.name === 'find_citations' && s.status === 'done' && s.display?.sources?.length === 0) && <p className="ch-quiet">No matching source was found.</p>}

      {files.map((f) => (
        <button key={f.name} type="button" className="ch-file" onClick={() => download(f)}>
          <Icon name="download" /> Download {f.name}
        </button>
      ))}
    </div>
  );
}
