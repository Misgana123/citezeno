'use client';

import type { ToolDisplay } from '@/lib/agent/tools/types';
import { Icon } from '../Icon';
import { PaperRefs } from './PaperRefs';
import { Timeline } from './steps/Timeline';
import { isShown, type WorkItem } from './steps/timeline';

/* What the assistant did for one turn: the timeline of its steps and notes,
   then what the steps found (a numbered reference list, sources, code that
   ran, a file to download). Each step lists its own web pages on the timeline. */

export type { LiveStep, WorkItem } from './steps/timeline';

type TextFile = { name: string; mime: string; text: string };
type StoredFile = Exclude<NonNullable<ToolDisplay['file']>, TextFile>;
const isStored = (f: NonNullable<ToolDisplay['file']>): f is StoredFile => 'id' in f;

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

export function Steps({ items, turn, chatId = null }: { items: WorkItem[]; turn: number; chatId?: string | null }) {
  const steps = items.flatMap((it) => (it.kind === 'step' && isShown(it.step) ? [it.step] : []));
  if (!steps.length) return null;
  const papers = steps.flatMap((s) => s.display?.papers ?? []);
  const saved = steps.flatMap((s) => s.display?.items ?? []);
  const refs = Object.assign({}, ...steps.map((s) => s.display?.refs ?? {})) as Record<string, number>;
  const sources = steps.flatMap((s) => s.display?.sources ?? []);
  const files = steps.flatMap((s) => [...(s.display?.file ? [s.display.file] : []), ...(s.display?.files ?? [])]);
  const code = steps.flatMap((s) => (s.display?.code ? [{ id: s.callId, ...s.display.code }] : []));
  // the same paper found twice in a turn is listed once
  const seen = new Set<string>();
  const uniquePapers = papers.filter((p) => !seen.has(p.id) && seen.add(p.id));
  const uniqueItems = saved.filter((i) => !seen.has(i.paper.id) && seen.add(i.paper.id));

  return (
    <div className="ch-turn-work">
      <Timeline items={items} />

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
      {steps.some((s) => s.name === 'find_citations' && s.status === 'done' && s.display?.sources?.length === 0) && <p className="ch-quiet">No matching source was found.</p>}

      {code.map((c) => (
        <details key={c.id} className={`ch-code${c.failed ? ' is-failed' : ''}`}>
          <summary>
            <Icon name="code" /> {c.failed ? 'Python (failed)' : 'Python'}
          </summary>
          <pre className="ch-code-src">
            <code>{c.source}</code>
          </pre>
          {c.output && (
            <pre className="ch-code-out" aria-label="Output">
              {c.output}
            </pre>
          )}
        </details>
      ))}

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
