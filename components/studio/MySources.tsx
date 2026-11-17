'use client';

import { useRef, useState } from 'react';
import { MAX_IMPORT_BYTES, parseReferences, type ImportFailure } from '@/lib/bibimport';
import type { Result, Source } from '@/lib/types';
import { Icon } from '../Icon';
import { authorLine } from './SourceCards';
import { SentencePicker } from './SentencePicker';

export type ImportOutcome = { added: number; duplicates: Source[] };
type Summary = { added: number; duplicates: Source[]; failed: ImportFailure[]; from: string };

/* "My sources": references imported from BibTeX or RIS (a file or pasted text),
   read in the browser. Free, no database search. Each one can be cited on any
   sentence or put in the reference list. */
export function MySources({
  result,
  onImport,
  onAttach,
  onToList,
  onRemove,
}: {
  result: Result;
  onImport: (sources: Source[]) => ImportOutcome;
  onAttach: (id: string, sid: number) => void;
  onToList: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const mine = (result.mine || []).map((id) => result.db.get(id)).filter((s): s is Source => !!s);

  const run = (raw: string, from: string) => {
    setErr('');
    const parsed = parseReferences(raw);
    if (parsed.format === 'unknown') {
      setSummary(null);
      setErr('That doesn’t look like BibTeX or RIS. Export your references as .bib or .ris and try again.');
      return false;
    }
    if (!parsed.sources.length && !parsed.failed.length) {
      setSummary(null);
      setErr('No references were found in it.');
      return false;
    }
    const out = parsed.sources.length ? onImport(parsed.sources) : { added: 0, duplicates: [] };
    setSummary({ added: out.added, duplicates: out.duplicates, failed: parsed.failed, from });
    return true;
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) {
      setErr('That file is larger than 5 MB. Export only the references you need.');
      return;
    }
    run(await f.text(), f.name);
  };

  const where = (id: string) => {
    const n = result.claims.filter((c) => c.ids.includes(id)).map((c) => c.sid + 1);
    if (n.length) return `Cited on sentence${n.length > 1 ? 's' : ''} ${n.join(', ')}`;
    if (result.extra.includes(id)) return 'In the reference list';
    return 'Not used yet';
  };

  return (
    <section className="mysrc" aria-labelledby="mysrc-title">
      <div className="mysrc-head">
        <div>
          <h3 id="mysrc-title">My sources</h3>
          <p>Import references from Zotero, Mendeley, EndNote or any tool that exports BibTeX (.bib) or RIS (.ris). They’re read in your browser and cost nothing.</p>
        </div>
        <div className="mysrc-btns">
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Import references
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaste((p) => !p)} aria-expanded={paste}>
            <Icon name="paste" /> Paste
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".bib,.ris,.bibtex,.txt,application/x-bibtex,application/x-research-info-systems"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {paste && (
        <div className="mysrc-paste">
          <textarea
            className="input"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'@article{key,\n  title = {…},\n  author = {…},\n  year = {2020}\n}\n\nor RIS: TY  - JOUR …'}
            aria-label="Paste BibTeX or RIS"
            spellCheck={false}
          />
          <div className="mysrc-paste-go">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaste(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-thread btn-sm"
              disabled={!text.trim()}
              onClick={() => {
                if (run(text, 'pasted text')) {
                  setText('');
                  setPaste(false);
                }
              }}
            >
              Import
            </button>
          </div>
        </div>
      )}

      {err && (
        <p className="addsrc-err" role="alert">
          {err}
        </p>
      )}

      {summary && (
        <div className={`mysrc-sum${summary.failed.length ? ' has-fail' : ''}`} role="status">
          <p>
            <Icon name={summary.added ? 'check' : 'alert'} />
            <span>
              From {summary.from}: <b>{summary.added}</b> imported
              {summary.duplicates.length ? `, ${summary.duplicates.length} duplicate${summary.duplicates.length === 1 ? '' : 's'} skipped` : ''}
              {summary.failed.length ? `, ${summary.failed.length} could not be read` : ''}.
            </span>
            <button type="button" className="icon-btn" onClick={() => setSummary(null)} aria-label="Dismiss">
              <Icon name="x" />
            </button>
          </p>
          {(summary.failed.length > 0 || summary.duplicates.length > 0) && (
            <details open={summary.failed.length > 0}>
              <summary>Details</summary>
              <ul>
                {summary.failed.map((f, i) => (
                  <li key={`f${i}`} className="fail">
                    <b>{f.label}</b> {f.reason}
                  </li>
                ))}
                {summary.duplicates.map((d, i) => (
                  <li key={`d${i}`}>
                    <b>{d.title}</b> is already in this trace.
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <ul className="mysrc-list">
          {mine.map((s) => {
            const status = where(s.id!);
            const used = status !== 'Not used yet';
            return (
              <li key={s.id}>
                <div className="mysrc-main">
                  <b className="serif">{s.title}</b>
                  <small>
                    {authorLine(s)}
                    {s.year ? ` · ${s.year}` : ' · n.d.'}
                    {s.container ? ` · ${s.container}` : s.publisher ? ` · ${s.publisher}` : ''}
                  </small>
                  <span className={`mysrc-status${used ? ' on' : ''}`}>{status}</span>
                </div>
                <div className="mysrc-actions">
                  <button type="button" className="btn btn-sm" onClick={() => setPicking(picking === s.id ? null : s.id!)} aria-expanded={picking === s.id}>
                    <Icon name="quote" /> Cite on a sentence
                  </button>
                  {!result.extra.includes(s.id!) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToList(s.id!)} title="List it in the references without citing a sentence">
                      Add to reference list
                    </button>
                  )}
                  <button type="button" className="icon-btn" onClick={() => onRemove(s.id!)} aria-label={`Remove “${s.title}” from My sources`} title="Remove from My sources">
                    <Icon name="trash" />
                  </button>
                </div>
                {picking === s.id && (
                  <SentencePicker
                    result={result}
                    label="Cite it on which sentence?"
                    onClose={() => setPicking(null)}
                    onPick={(sid) => {
                      setPicking(null);
                      onAttach(s.id!, sid);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
