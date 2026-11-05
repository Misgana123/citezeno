'use client';

import { useCallback, useRef, useState } from 'react';
import type { DocOptions } from '@/lib/docmodel';
import { richHTML, type Rendered } from '@/lib/engine';
import { downloadPdf, downloadWord } from '@/lib/exportdoc';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import type { Mode, Prefs, Result, Source } from '@/lib/types';
import { Icon, type IconName } from '../Icon';
import { copyText } from '../Specimens';
import { MODES } from './Controls';
import { PagedSheet } from './PagedSheet';
import { ExportPanel } from './ExportPanel';
import { Insights } from './Insights';
import { SourceMap } from './SourceMap';
import { SourceCards, scoreFor } from './SourceCards';
import { toast } from '../toast';

export type Tab = 'doc' | 'refs' | 'sources' | 'map' | 'insights' | 'export';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'doc', label: 'Manuscript', icon: 'doc' },
  { id: 'refs', label: 'References', icon: 'list' },
  { id: 'sources', label: 'Sources', icon: 'cards' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'export', label: 'Export', icon: 'code' },
];

const TITLES: Record<Mode, string> = {
  intext: 'Your cited manuscript',
  footnotes: 'Your manuscript with footnotes',
  endnotes: 'Your manuscript with endnotes',
  list: 'Your bibliography',
  annotated: 'Your annotated bibliography',
};

/* Light up every element that shares a reference number with the hovered one. */
function useLinking() {
  const root = useRef<HTMLDivElement>(null);
  const lit = useCallback((refs: string, on: boolean) => {
    refs.split(' ').forEach((r) =>
      root.current?.querySelectorAll(`[data-ref~="${r}"]`).forEach((n) => n.classList.toggle('lit', on)),
    );
  }, []);
  const onMouseOver = (e: React.MouseEvent) => {
    const n = (e.target as HTMLElement).closest('[data-ref]') as HTMLElement | null;
    if (n) lit(n.dataset.ref!, true);
  };
  const onMouseOut = (e: React.MouseEvent) => {
    const n = (e.target as HTMLElement).closest('[data-ref]') as HTMLElement | null;
    if (n) lit(n.dataset.ref!, false);
  };
  return { root, onMouseOver, onMouseOut };
}

export function Results({
  result,
  rendered,
  prefs,
  setPrefs,
  tab,
  setTab,
  annotations,
  onReplace,
  onRemove,
  onAdd,
  onPin,
  doc,
  setDoc,
}: {
  result: Result;
  rendered: Rendered;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  annotations: { current: Record<string, string> };
  onReplace: (oldId: string, newId: string) => void;
  onRemove: (id: string) => void;
  onAdd: (s: Source, ci: number) => void;
  onPin: (id: string, pin: string) => void;
  doc: DocOptions;
  setDoc: (p: Partial<DocOptions>) => void;
}) {
  const { root, onMouseOver, onMouseOut } = useLinking();
  const [busy, setBusy] = useState<'' | 'word' | 'pdf'>('');

  const scores: number[] = [];
  rendered.list.forEach((s) => {
    const sc = scoreFor(result, s.id!).score;
    if (sc != null) scores.push(sc);
  });
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0;
  const cited = result.claims.filter((c) => c.ids.length).length;
  const short = result.requested - rendered.list.length;

  /* annotation edits live in a ref so typing never re-renders the sheet under the caret */
  const onInput = (e: React.FormEvent) => {
    const t = e.target as HTMLElement;
    if (!t.classList.contains('annot')) return;
    const id = t.dataset.id!;
    annotations.current[id] = t.textContent || '';
    root.current?.querySelectorAll<HTMLElement>('.annot').forEach((n) => {
      if (n !== t && n.dataset.id === id) n.textContent = t.textContent;
    });
  };

  const word = () => {
    setBusy('word');
    setTimeout(() => {
      try {
        downloadWord(result, prefs.style, prefs.mode, annotations.current, doc);
        toast('Word document downloaded');
      } catch (e) {
        toast(`The Word file could not be made: ${(e as Error).message}`, true);
      }
      setBusy('');
    }, 30);
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      await downloadPdf(result, prefs.style, prefs.mode, annotations.current, doc);
      toast('PDF downloaded');
    } catch (e) {
      toast(`The PDF could not be made: ${(e as Error).message}`, true);
    }
    setBusy('');
  };
  const docButtons = (
    <>
      <button className="btn btn-ghost btn-sm" onClick={word} disabled={!!busy}>
        <Icon name="word" /> Word
      </button>
      <button className="btn btn-ghost btn-sm" onClick={pdf} disabled={!!busy}>
        <Icon name="pdf" /> PDF
      </button>
    </>
  );

  return (
    <section className="res" id="results" ref={root} onMouseOver={onMouseOver} onMouseOut={onMouseOut} onInput={onInput}>
      <header className="res-head">
        <div>
          <h2 className="h2">{TITLES[prefs.mode]}</h2>
          <ul className="res-meta">
            <li><b>{rendered.list.length}</b> source{rendered.list.length === 1 ? '' : 's'}</li>
            <li><b>{cited}</b> claim{cited === 1 ? '' : 's'} cited</li>
            <li><b>{avg}%</b> average match</li>
            {short > 0 && <li className="warn">Found {rendered.list.length} of the {result.requested} you asked for</li>}
          </ul>
        </div>
        <div className="res-tools">
          <label className="field">
            Style
            <select className="select" value={prefs.style} onChange={(e) => setPrefs({ style: e.target.value })}>
              {STYLE_GROUPS.map(([g, ids]) => (
                <optgroup key={g} label={g}>
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {STYLES[id].name}, {STYLES[id].edition}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            Output
            <select className="select" value={prefs.mode} onChange={(e) => setPrefs({ mode: e.target.value as Mode })}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Result views">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
            {(t.id === 'refs' || t.id === 'sources') && <span className="tab-count">{rendered.list.length}</span>}
          </button>
        ))}
      </div>

      <div className="panel" role="tabpanel">
        {tab === 'doc' && (
          <>
            <div className="panel-tools">
              <span className="small">
                {prefs.mode === 'list' || prefs.mode === 'annotated'
                  ? 'Sentences matched to a source are highlighted.'
                  : 'Point at a citation to light up its reference.'}
              </span>
              <div className="panel-btns">
                <button className="btn btn-ghost btn-sm" onClick={() => copyText(rendered.docPlain, richHTML(rendered.docHtml))}>
                  <Icon name="copy" /> Copy
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => copyText(rendered.docPlain)}>
                  Plain text
                </button>
                {docButtons}
              </div>
            </div>
            {rendered.modeNote && <p className="mode-note">{rendered.modeNote}</p>}
            <PagedSheet html={rendered.docHtml} label={`${STYLES[prefs.style].name}, ${STYLES[prefs.style].edition}`} />
          </>
        )}

        {tab === 'refs' && (
          <>
            <div className="panel-tools">
              <span className="small">Hanging indents and italics are kept when you copy with formatting.</span>
              <div className="panel-btns">
                <button className="btn btn-ghost btn-sm" onClick={() => copyText(rendered.refPlain, richHTML(rendered.refHtml))}>
                  <Icon name="copy" /> Copy
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => copyText(rendered.refPlain)}>
                  Plain text
                </button>
              </div>
            </div>
            <PagedSheet html={rendered.refHtml.replace('class="list-title"', 'class="list-title first"')} label={rendered.listTitle} />
          </>
        )}

        {tab === 'sources' && <SourceCards result={result} rendered={rendered} onReplace={onReplace} onRemove={onRemove} onAdd={onAdd} onPin={onPin} />}

        {tab === 'map' && (
          <>
            <div className="panel-tools">
              <span className="small">Each thread is one citation. Thicker threads are stronger matches. Point at a claim or source to trace it.</span>
            </div>
            <SourceMap result={result} rendered={rendered} />
          </>
        )}

        {tab === 'insights' && <Insights result={result} rendered={rendered} />}

        {tab === 'export' && (
          <ExportPanel rendered={rendered} doc={doc} setDoc={setDoc} onWord={word} onPdf={pdf} busy={busy} style={prefs.style} />
        )}
      </div>
    </section>
  );
}
