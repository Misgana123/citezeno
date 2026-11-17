'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { readDraftFile } from '@/lib/importfile';
import { SAMPLES } from '@/lib/samples';
import { analyse, isEligible, locate, words } from '@/lib/text';
import type { Analysis } from '@/lib/types';
import { Icon } from '../Icon';
import { toast } from '../toast';

/* "I'll pick sentences": the picked sentences (by text) and what to do with them. */
export type PickControls = {
  picked: Set<string>;
  count: number;
  max: number;
  cost: number;
  toggle: (text: string) => void;
  suggest: () => void;
  clear: () => void;
  done: () => void;
};

/* Segments for the highlight layer behind the textarea. */
function useSegments(value: string, analysis: Analysis | null, cited: Set<string>, highlight: boolean, picked: Set<string> | null) {
  return useMemo(() => {
    if (!analysis) return [{ t: value, cls: '' }];
    const out: { t: string; cls: string }[] = [];
    let cursor = 0;
    const spans = locate(value, analysis.sentences);
    const byIndex = new Map(analysis.sentences.map((s) => [s.index, s]));
    for (const sp of spans) {
      const s = byIndex.get(sp.index)!;
      const cls = picked
        ? picked.has(s.text)
          ? 'picked'
          : 'pickable'
        : cited.has(s.text)
          ? 'cited'
          : highlight && isEligible(s)
            ? (s.score || 0) > 1.8
              ? 'hl-3'
              : (s.score || 0) > 1.1
                ? 'hl-2'
                : 'hl-1'
            : '';
      if (!cls) continue;
      if (sp.start > cursor) out.push({ t: value.slice(cursor, sp.start), cls: '' });
      out.push({ t: value.slice(sp.start, sp.end), cls });
      cursor = sp.end;
    }
    if (cursor < value.length) out.push({ t: value.slice(cursor), cls: '' });
    return out;
  }, [value, analysis, cited, highlight, picked]);
}

/* below: there is no room above the selection, so the popover opens under it */
type Sel = { start: number; end: number; text: string; x: number; y: number; open: boolean; below: boolean };

/* What the studio can ask the editor to do: select a passage and bring it into view. */
export type EditorApi = { select: (start: number, end: number) => void };

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
  api,
  pick,
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
  api?: MutableRefObject<EditorApi | null>;
  /* set while the user picks sentences by hand */
  pick?: PickControls | null;
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
  const [menu, setMenu] = useState(false);
  const menuBox = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const segs = useSegments(value, analysis, cited, highlight, pick ? pick.picked : null);

  /* in pick mode a click (or Enter / Space at the caret) selects the sentence under it */
  const pickAt = (pos: number) => {
    if (!pick || !value.trim()) return;
    // the analysis prop can lag behind the text; picking reads the text as it is now
    const a = analyse(value);
    const sp = locate(value, a.sentences).find((x) => pos >= x.start && pos <= x.end);
    const s = sp && a.sentences.find((x) => x.index === sp.index);
    if (s) pick.toggle(s.text);
  };
  const claims = analysis ? analysis.sentences.filter(isEligible).length : 0;
  const citedCount = analysis ? analysis.sentences.filter((s) => cited.has(s.text)).length : 0;

  /* page height follows the A4 ratio of the sheet's width */
  useEffect(() => {
    const el = paper.current;
    if (!el) return;
    // a hidden or collapsed sheet measures 0 wide: keep the last real height
    const ro = new ResizeObserver(() => el.clientWidth > 0 && setPageH(Math.round(el.clientWidth * 1.4142)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* grow the sheet in whole pages, like a word processor */
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    const n = pageH > 0 ? Math.min(500, Math.max(1, Math.ceil(el.scrollHeight / pageH))) : 1;
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
    // no "Cite this claim" while picking sentences
    if (pick) return setSel(null);
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
    let y = mark.offsetTop;
    const v = scroller.current;
    const below = v ? mark.getBoundingClientRect().top - v.getBoundingClientRect().top < 270 : false;
    if (below) {
      // no room above: hang the popover under the last line of the selection instead
      m.textContent = '';
      m.append(document.createTextNode(value.slice(0, b)));
      m.append(mark);
      y = mark.offsetTop;
    }
    setSel((s) => ({ start: a, end: b, text, x, y, below, open: s && s.start === a && s.end === b ? s.open : false }));
  }, [value, citing, pick]);

  /* let the claims outline select a sentence here */
  useEffect(() => {
    if (!api) return;
    api.current = {
      select: (start, end) => {
        const el = ta.current;
        const m = measure.current;
        const v = scroller.current;
        if (!el || !m || !v) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(start, end);
        m.textContent = '';
        m.append(document.createTextNode(value.slice(0, start)));
        const mark = document.createElement('span');
        mark.textContent = '\u200b';
        m.append(mark);
        const top = mark.getBoundingClientRect().top - v.getBoundingClientRect().top + v.scrollTop;
        v.scrollTo({ top: Math.max(0, top - Math.max(290, v.clientHeight * 0.4)), behavior: 'smooth' });
        section.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        onSelect();
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, value, onSelect]);

  /* the samples menu closes on an outside click or Escape */
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuBox.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const cite = async () => {
    if (!sel) return;
    const ok = await onCite(sel.text, sel.start, sel.end, n);
    if (ok) setSel(null);
  };

  return (
    <section className="at-card at-draft" aria-label="Your draft" ref={section}>
      <header
        className="at-draft-bar"
        onClick={(e) => {
          if (e.target === e.currentTarget) ta.current?.focus();
        }}
      >
        <label htmlFor="draft-input" className="at-draft-title">
          <span className="at-draft-ico"><Icon name="doc" /></span>
          <span>
            <b>Your draft</b>
            <small>
              {pick
                ? 'Picking sentences. Editing is paused until you stop picking.'
                : value.trim()
                  ? 'Click the page to edit. Select a passage to cite just that claim.'
                  : 'Start typing or paste your text on the page below'}
            </small>
          </span>
        </label>
        <div className="at-tools">
          <button className="at-tool" onClick={pasteClip} title="Paste from the clipboard" disabled={Boolean(pick)}>
            <Icon name="paste" /> <span>Paste</span>
          </button>
          <button className="at-tool" onClick={() => fileRef.current?.click()} title="Open a .docx, .txt or .md file" disabled={Boolean(pick)}>
            <Icon name="upload" /> <span>Open file</span>
          </button>
          <div className="at-menu-wrap" ref={menuBox}>
            <button className="at-tool" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-haspopup="menu" title="Load a sample draft" disabled={Boolean(pick)}>
              <Icon name="sparkle" /> <span>Samples</span>
              <Icon name="chevron" className="at-tool-chev" />
            </button>
            {menu && (
              <div className="at-menu" role="menu">
                <p>Load a sample draft</p>
                {Object.entries(SAMPLES).map(([k, smp]) => (
                  <button
                    key={k}
                    role="menuitem"
                    onClick={() => {
                      onChange(smp.text);
                      setSel(null);
                      setMenu(false);
                    }}
                  >
                    <Icon name="doc" />
                    <span>
                      <b>{smp.label}</b>
                      <small>{words(smp.text).length} words</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {value && (
            <button className="at-tool" onClick={() => onChange('')} title="Clear the draft" disabled={Boolean(pick)}>
              <Icon name="eraser" /> <span>Clear</span>
            </button>
          )}
          <span className="at-tool-sep" aria-hidden="true" />
          <label className="at-toggle" title="Underline the sentences worth citing">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
            <span className="at-switch" aria-hidden="true" />
            <span>Mark claims</span>
          </label>
        </div>
      </header>
      {pick && (
        <div className="pickbar" role="region" aria-label="Pick sentences">
          <div className="pickbar-txt">
            <b>Pick the sentences to cite</b>
            <small>Click a sentence to select it, click again to unselect. Any sentence counts, underlined or not.</small>
          </div>
          <span className={`pickbar-count${pick.count >= pick.max ? ' full' : ''}`} aria-live="polite">
            <b>{pick.count}</b> selected{pick.count >= pick.max ? ` (the most per trace)` : ''}
          </span>
          <div className="pickbar-btns">
            <button type="button" className="at-tool" onClick={pick.suggest} title="Add the sentences Citezeno would choose" aria-label="Add suggested sentences">
              <Icon name="sparkle" /> <span>Add suggested</span>
            </button>
            {pick.count > 0 && (
              <button type="button" className="at-tool" onClick={pick.clear} aria-label="Clear the picked sentences" title="Clear the picked sentences">
                <Icon name="eraser" /> <span>Clear</span>
              </button>
            )}
            <button type="button" className="at-tool" onClick={pick.done} title="Go back to letting Citezeno choose" aria-label="Stop picking">
              <Icon name="x" /> <span>Stop picking</span>
            </button>
            <button type="button" className="btn btn-thread btn-sm pickbar-go" onClick={onRun} disabled={!pick.count}>
              <Icon name="search" /> Trace selected{pick.count ? ` · ${pick.cost} credit${pick.cost === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        </div>
      )}
      <div className="dview-scroll" ref={scroller} onScroll={onScroll}>
      <div
        ref={paper}
        className={`dpage${drag ? ' drag' : ''}${value.trim() ? '' : ' empty'}${pick ? ' picking' : ''}`}
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
          spellCheck={!pick}
          readOnly={Boolean(pick)}
          aria-readonly={Boolean(pick)}
          onClick={(e) => {
            if (!pick) return;
            const el = e.currentTarget;
            if (el.selectionStart === el.selectionEnd) pickAt(el.selectionStart);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setSel(null);
          }}
          onSelect={onSelect}
          onMouseUp={onSelect}
          onKeyUp={onSelect}
          onKeyDown={(e) => {
            if (pick && (e.key === 'Enter' || e.key === ' ') && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              pickAt(e.currentTarget.selectionStart);
              return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (sel) cite();
              else onRun();
            }
            if (e.key === 'Escape') setSel(null);
          }}
          aria-label={pick ? 'Draft text. Click a sentence, or move the caret to it and press Enter, to pick it' : 'Draft text'}
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
          <div className={`selpop${sel.open ? ' open' : ''}${sel.below ? ' below' : ''}`} style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
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

      <footer className="at-draft-foot">
        <div className="at-stats">
          <span className="at-stat-page">Page <b>{pageNow}</b> of <b>{pageCount}</b></span>
          <span><b>{analysis ? analysis.wordCount.toLocaleString() : 0}</b> words</span>
          <span><b>{analysis ? analysis.sentences.length : 0}</b> sentences</span>
          <span className="hot"><i className="dot-claim" /> <b>{claims}</b> citable claims</span>
          {citedCount > 0 && !pick && <span className="ok"><i className="dot-cited" /> <b>{citedCount}</b> cited</span>}
          {pick && <span className="pick"><i className="dot-picked" /> <b>{pick.count}</b> picked</span>}
        </div>
        <span className="at-kbd-hint">
          <span className="kbd">Ctrl</span> <span className="kbd">↵</span> to trace
        </span>
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
