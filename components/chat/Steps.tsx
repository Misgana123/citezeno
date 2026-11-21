'use client';

import type { ToolDisplay } from '@/lib/agent/tools/types';
import type { StepView } from '@/lib/agent/types';
import { Icon } from '../Icon';
import { PaperRefs } from './PaperRefs';

/* The steps the assistant took for one turn, as one compact checklist: what
   each did and what it came to, then what the steps
   found (a numbered reference list, sources, a file to download). */

export type LiveStep = Omit<StepView, 'status'> & { status: StepView['status'] | 'running' };

type TextFile = { name: string; mime: string; text: string };
type StoredFile = Exclude<NonNullable<ToolDisplay['file']>, TextFile>;
const isStored = (f: NonNullable<ToolDisplay['file']>): f is StoredFile => 'id' in f;

/* "who.int" from a page's address */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* "84 KB", "2.4 MB" */
function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* A file the assistant made and stored: a picture is shown, every file can be downloaded. */
function StoredFileCard({ file }: { file: StoredFile }) {
  const href = `/api/agent/files/${encodeURIComponent(file.id)}`;
  return (
    <div className="ch-made">
      {file.mime.startsWith('image/') && (
        <a href={`${href}?inline=1`} target="_blank" rel="noopener noreferrer" className="ch-made-pic">
          <img src={`${href}?inline=1`} alt={file.name} loading="lazy" />
        </a>
      )}
      <a className="ch-file" href={href} download={file.name}>
        <Icon name="download" /> Download {file.name} <span className="ch-file-size">{size(file.size)}</span>
      </a>
    </div>
  );
}

function download(file: TextFile) {
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

/* How many results a step found, for rows saved before steps had a summary. */
function count(d?: ToolDisplay): string | null {
  if (!d) return null;
  const n = (d.papers?.length ?? 0) + (d.items?.length ?? 0) + (d.sources?.length ?? 0) + (d.links?.length ?? 0);
  return n ? `${n} result${n === 1 ? '' : 's'}` : null;
}

export function Steps({ steps, turn, chatId = null }: { steps: LiveStep[]; turn: number; chatId?: string | null }) {
  const papers = steps.flatMap((s) => s.display?.papers ?? []);
  const items = steps.flatMap((s) => s.display?.items ?? []);
  const refs = Object.assign({}, ...steps.map((s) => s.display?.refs ?? {})) as Record<string, number>;
  const sources = steps.flatMap((s) => s.display?.sources ?? []);
  const files = steps.flatMap((s) => (s.display?.file ? [s.display.file] : []));
  // the same page found by two searches (or searched, then read) is listed once
  const seenLinks = new Set<string>();
  const links = steps.flatMap((s) => s.display?.links ?? []).filter((l) => /^https?:\/\//i.test(l.url) && !seenLinks.has(l.url) && seenLinks.add(l.url));
  // the same paper found twice in a turn is listed once
  const seen = new Set<string>();
  const uniquePapers = papers.filter((p) => !seen.has(p.id) && seen.add(p.id));
  const uniqueItems = items.filter((i) => !seen.has(i.paper.id) && seen.add(i.paper.id));

  const running = steps.some((s) => s.status === 'running');
  const failed = !running && steps.some((s) => s.status === 'error');
  const current = steps.find((s) => s.status === 'running') ?? steps.at(-1);
  const summary = running ? current?.label : steps.length === 1 ? steps[0].label : `${steps[0].label}, and ${steps.length - 1} more`;

  return (
    <div className="ch-turn-work">
      <details className="ch-steps-box" open={running || undefined}>
        <summary>
          <StepIcon status={running ? 'running' : failed ? 'error' : 'done'} />
          <span className="ch-steps-sum">{summary}</span>
          <span className="ch-step-count">
            {steps.length} step{steps.length === 1 ? '' : 's'}
          </span>
          <Icon name="chevron" className="ch-steps-chev" />
        </summary>
      <ol className="ch-steps" aria-label="Steps">
        {steps.map((s) => (
          <li key={s.callId} className={`ch-step is-${s.status}`}>
            <StepIcon status={s.status} />
            <span className="ch-step-label">{s.status === 'declined' ? `Not done: ${s.label}` : s.label}</span>
            {s.status === 'done' && (s.display?.summary ?? count(s.display)) && <span className="ch-step-count">{s.display?.summary ?? count(s.display)}</span>}
            {s.status === 'error' && s.error && <p className="ch-step-error">{s.error}</p>}
          </li>
        ))}
      </ol>
      </details>

      <PaperRefs papers={uniquePapers} items={uniqueItems} refs={refs} turn={turn} chatId={chatId} />

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
      {links.length > 0 && (
        <ul className="ch-links" aria-label="Web pages">
          {links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.title}>
                {l.title}
              </a>
              <span className="ch-link-host">
                {host(l.url)}
                {l.published ? ` · ${l.published}` : ''}
              </span>
              {l.snippet && <p>{l.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
      {steps.some((s) => s.name === 'find_citations' && s.status === 'done' && s.display?.sources?.length === 0) && <p className="ch-quiet">No matching source was found.</p>}

      {files.map((f) =>
        isStored(f) ? (
          <StoredFileCard key={f.id} file={f} />
        ) : (
          <button key={f.name} type="button" className="ch-file" onClick={() => download(f)}>
            <Icon name="download" /> Download {f.name}
          </button>
        ),
      )}
    </div>
  );
}
