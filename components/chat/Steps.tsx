'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ToolDisplay } from '@/lib/agent/tools/types';
import type { StepView } from '@/lib/agent/types';
import { Icon } from '../Icon';
import { PaperCard } from '../papers/PaperCard';

/* The steps the assistant took for one turn: what each did, with what input,
   how it went, and what it found (paper cards, saved papers, a file). */

export type LiveStep = Omit<StepView, 'status'> & { status: StepView['status'] | 'running' };

const PAPERS_SHOWN = 3;

function download(file: NonNullable<ToolDisplay['file']>) {
  const url = URL.createObjectURL(new Blob([file.text], { type: `${file.mime};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Found({ display }: { display: ToolDisplay }) {
  const [all, setAll] = useState(false);
  const papers = display.papers ?? [];
  const shown = all ? papers : papers.slice(0, PAPERS_SHOWN);
  return (
    <>
      {papers.length > 0 && (
        <div className="ch-found">
          <ul className="fp-list">
            {shown.map((p) => (
              <PaperCard key={p.id} paper={p} />
            ))}
          </ul>
          {papers.length > PAPERS_SHOWN && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${papers.length} papers`}
            </button>
          )}
        </div>
      )}
      {display.items && display.items.length > 0 && (
        <ul className="ch-items">
          {display.items.slice(0, 12).map((i) => (
            <li key={i.id}>
              <Link href={`/app/shelf?item=${encodeURIComponent(i.id)}`}>
                <Icon name="layers" /> {i.paper.title}
              </Link>
              {i.paper.year != null && <span>{i.paper.year}</span>}
              {i.paper.isRetracted && <span className="tag ch-retracted">Retracted</span>}
            </li>
          ))}
          {display.items.length > 12 && <li className="ch-more">and {display.items.length - 12} more on your shelf</li>}
        </ul>
      )}
      {display.sources && (
        <ul className="ch-sources">
          {display.sources.length === 0 && <li className="ch-more">No matching source was found.</li>}
          {display.sources.map((src, k) => (
            <li key={k}>
              <p className="ch-ref">
                {src.reference} {src.retracted && <span className="tag ch-retracted">Retracted</span>}
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
      {display.file && (
        <button type="button" className="btn btn-thread btn-sm ch-file" onClick={() => download(display.file!)}>
          <Icon name="download" /> Download {display.file.name}
        </button>
      )}
    </>
  );
}

function StepIcon({ status }: { status: LiveStep['status'] }) {
  if (status === 'running') return <span className="ch-spin" aria-label="Working" />;
  if (status === 'done') return <Icon name="check" />;
  if (status === 'declined') return <Icon name="x" />;
  return <Icon name="alert" />;
}

export function Steps({ steps }: { steps: LiveStep[] }) {
  return (
    <ol className="ch-steps" aria-label="Steps">
      {steps.map((s) => (
        <li key={s.callId} className={`ch-step is-${s.status}`}>
          <div className="ch-step-head">
            <StepIcon status={s.status} />
            <span className="ch-step-label">{s.status === 'declined' ? `Not done: ${s.label}` : s.label}</span>
            <details className="ch-step-input">
              <summary>Details</summary>
              <p className="ch-step-tool">{s.name}</p>
              <pre>{JSON.stringify(s.input, null, 2)}</pre>
            </details>
          </div>
          {s.status === 'error' && s.error && <p className="ch-step-error">{s.error}</p>}
          {s.display && <Found display={s.display} />}
        </li>
      ))}
    </ol>
  );
}
