'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readDraftFile } from '@/lib/importfile';
import { SAMPLES } from '@/lib/samples';
import { isEligible, locate, words } from '@/lib/text';
import type { Analysis } from '@/lib/types';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* Segments for the highlight layer behind the textarea. */
function useSegments(value: string, analysis: Analysis | null, cited: Set<string>, highlight: boolean) {
  return useMemo(() => {
    if (!analysis) return [{ t: value, cls: '' }];
    const out: { t: string; cls: string }[] = [];
    let cursor = 0;
    const spans = locate(value, analysis.sentences);
    const byIndex = new Map(analysis.sentences.map((s) => [s.index, s]));
    for (const sp of spans) {
      const s = byIndex.get(sp.index)!;
      const cls = cited.has(s.text) ? 'cited' : highlight && isEligible(s) ? ((s.score || 0) > 1.8 ? 'hl-3' : (s.score || 0) > 1.1 ? 'hl-2' : 'hl-1') : '';
      if (!cls) continue;
      if (sp.start > cursor) out.push({ t: value.slice(cursor, sp.start), cls: '' });
      out.push({ t: value.slice(sp.start, sp.end), cls });
      cursor = sp.end;
    }
    if (cursor < value.length) out.push({ t: value.slice(cursor), cls: '' });
    return out;
  }, [value, analysis, cited, highlight]);
}

type Sel = { start: number; end: number; text: string; x: number; y: number; open: boolean };

export function Editor({
  value,
  onChange,
  analysis,
  cited,
  highlight,
  setHighlight,
  onRun,
  onCite,
  citing,
}: {
  value: string;
  onChange: (v: string) => void;
  analysis: Analysis | null;
  cited: Set<string>;
  highlight: boolean;
  setHighlight: (v: boolean) => void;
  onRun: () => void;
  onCite: (text: string, start: number, end: number, n: number) => Promise<boolean>;
  citing: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [pageH, setPageH] = useState(1100);
  const [pageCount, setPageCount] = useState(1);
  const [pageNow, setPageNow] = useState(1);
  const [n, setN] = useState(2);
  const segs = useSegments(value, analysis, cited, highlight);
  const claims = analysis ? analysis.sentences.filter(isEligible).length : 0;
  const citedCount = analysis ? analysis.sentences.filter((s) => cited.has(s.text)).length : 0;

  /* page height follows the A4 ratio of the sheet's width */
  useEffect(() => {
    const el = paper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPageH(Math.round(el.clientWidth * 1.4142)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* grow the sheet in whole pages, like a word processor */
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    const n = Math.max(1, Math.ceil(el.scrollHeight / pageH));
    el.style.height = n * pageH + 'px';
    setPageCount(n);
  }, [value, pageH]);

  const onScroll = () => {
    const v = scroller.current;
    if (!v) return;
    setPageNow(Math.min(pageCount, Math.floor((v.scrollTop + v.clientHeight * 0.35) / pageH) + 1));
  };

  useEffect(() => {
    if (!value) ta.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pasteClip = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast('The clipboard has no text in it.', true);
      onChange(value ? value.replace(/\s*$/, '') + '\n\n' + t : t);
      ta.current?.focus();
    } catch {
      toast('The browser blocked reading the clipboard. Click the page and press Ctrl+V instead.', true);
    }
  };

  const load = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await readDraftFile(f);
      if (!text.trim()) throw new Error('That file has no text in it.');
      onChange(text);
      toast(`Opened ${f.name}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  /* place the "cite this" button above the start of the selection */
  const onSelect = useCallback(() => {
    const el = ta.current;
    const m = measure.current;
    if (!el || !m) return;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const text = value.slice(a, b);
    if (b - a < 8 || words(text).length < 3) {
      setSel((s) => (s && s.open && citing ? s : null));
      return;
    }
    m.textContent = '';
    m.append(document.createTextNode(value.slice(0, a)));
    const mark = document.createElement('span');
    mark.textContent = '​';
    m.append(mark);
    const x = Math.max(16, Math.min(mark.offsetLeft - 12, m.clientWidth - 316));
    const y = mark.offsetTop;
    setSel((s) => ({ start: a, end: b, text, x, y, open: s && s.start === a && s.end === b ? s.open : false }));
  }, [value, citing]);

  const cite = async () => {
    if (!sel) return;
    const ok = await onCite(sel.text, sel.start, sel.end, n);
    if (ok) setSel(null);
  };

  return (
    <section className="doc" aria-label="Your draft">
      <div
        className="page-head"
        onClick={(e) => {
          if (e.target === e.currentTarget) ta.current?.focus();
        }}
      >
        <label htmlFor="draft-input" className="page-head-l">
          <span className="page-head-ico"><Icon name="doc" /></span>
          <span>
            <b>Your draft</b>
            <small>{value.trim() ? 'Click anywhere on the page to edit' : 'Start typing or paste your text on the page below'}</small>
          </span>
        </label>
        <div className="page-head-r">
          <button className="doc-btn" onClick={pasteClip}>
            <Icon name="copy" /> Paste
          </button>
          <button className="doc-btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Open file
          </button>
          {value && (
            <button className="doc-btn" onClick={() => onChange('')}>
              <Icon name="eraser" /> Clear
            </button>
          )}
        </div>
      </div>
      <div className="dview-scroll" ref={scroller} onScroll={onScroll}>
      <div
        ref={paper}
        className={`page${drag ? ' drag' : ''}${value.trim() ? '' : ' empty'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) ta.current?.focus();
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDrag(true);
          }
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDrag(false);
          load(e.dataTransfer.files[0]);
        }}
      >
        <div className="page-mirror" aria-hidden="true">
          {segs.map((s, i) => (s.cls ? <mark key={i} className={s.cls}>{s.t}</mark> : <span key={i}>{s.t}</span>))}
          {'\n'}
        </div>
        <div className="page-mirror page-measure" ref={measure} aria-hidden="true" />
        {Array.from({ length: pageCount - 1 }, (_, k) => (
          <div key={k} className="pbreak" style={{ top: (k + 1) * pageH }} aria-hidden="true">
            <span>Page {k + 2}</span>
          </div>
        ))}
        <textarea
          ref={ta}
          id="draft-input"
          className="page-input"
          placeholder=""
          value={value}
          spellCheck
          onChange={(e) => {
            onChange(e.target.value);
            setSel(null);
          }}
          onSelect={onSelect}
          onMouseUp={onSelect}
          onKeyUp={onSelect}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (sel) cite();
              else onRun();
            }
            if (e.key === 'Escape') setSel(null);
          }}
          aria-label="Draft text"
        />

        {!value.trim() && (
          <div className="page-prompt" aria-hidden="true">
            <span className="page-caret" />
            Start typing, or paste your AI-written text here…
          </div>
        )}

        {!value.trim() && (
          <div className="page-empty">
            <div className="page-empty-tip">
              <span className="kbd">Ctrl</span> <span className="kbd">V</span> to paste, or drop a .docx, .txt or .md file here
            </div>
            <div className="page-empty-samples">
              <span>No draft yet? Try a sample:</span>
              {Object.entries(SAMPLES).map(([k, s]) => (
                <button key={k} onClick={() => onChange(s.text)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {drag && <div className="page-drop"><Icon name="upload" /> Drop to open this file</div>}

        {sel && (
          <div className={`selpop${sel.open ? ' open' : ''}`} style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
            {!sel.open ? (
              <button className="selpop-pill" onClick={() => setSel({ ...sel, open: true })}>
                <Icon name="quote" /> Cite this claim
              </button>
            ) : (
              <div className="selpop-card" role="dialog" aria-label="Cite the selected passage">
                <div className="selpop-head">
                  <b>Cite this claim</b>
                  <button className="icon-btn" aria-label="Close" onClick={() => setSel(null)}>
                    <Icon name="x" />
                  </button>
                </div>
                <p className="selpop-quote serif">“{sel.text.length > 160 ? sel.text.slice(0, 160).trim() + '…' : sel.text.trim()}”</p>
                <div className="selpop-row">
                  <span>Sources</span>
                  <div className="seg" role="group" aria-label="How many sources">
                    {[1, 2, 3].map((k) => (
                      <button key={k} aria-pressed={n === k} onClick={() => setN(k)}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn btn-thread btn-sm selpop-go" onClick={cite} disabled={citing}>
                  {citing ? (
                    <>
                      <span className="spin" aria-hidden="true" /> Searching the databases…
                    </>
                  ) : (
                    <>
                      <Icon name="search" /> Find sources for this claim
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      </div>

      <footer className="doc-bar">
        <div className="doc-stats">
          <span className="doc-page">Page <b>{pageNow}</b> of <b>{pageCount}</b></span>
          <span><b>{analysis ? analysis.wordCount : 0}</b> words</span>
          <span><b>{analysis ? analysis.sentences.length : 0}</b> sentences</span>
          <span className="hot"><i className="dot-claim" /> <b>{claims}</b> citable claims</span>
          {citedCount > 0 && <span className="ok"><i className="dot-cited" /> <b>{citedCount}</b> cited</span>}
        </div>
        <div className="doc-tools">
          <label className="mini-switch">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
            <span className="sw" aria-hidden="true" />
            Mark claims
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.txt,.md,.markdown,text/plain"
          hidden
          onChange={(e) => {
            load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </footer>
    </section>
  );
}
