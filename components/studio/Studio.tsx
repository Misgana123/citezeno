'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DOC, suggestTitle, type DocOptions } from '@/lib/docmodel';
import {
  TraceError, addSource, attachClaim, citedSet, removeSource, render, replaceSource, sentenceForSelection, trace, traceClaim,
  type LogLine, type Step, type StepState,
} from '@/lib/engine';
import { useSession } from '@/lib/auth-client';
import { deleteRemote, fetchRemote, pushRemote, syncLibrary, type LibItem } from '@/lib/cloud';
import { fromSaved, loadLibrary, removeEntry, toSaved, upsert, type Saved } from '@/lib/library';
import { SAMPLES } from '@/lib/samples';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import { enrich } from '@/lib/sources';
import { analyse, chooseClaims, topicTokens } from '@/lib/text';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import { DEFAULT_PREFS, type ApiSettings, type Mode, type Prefs, type Result, type Source } from '@/lib/types';
import { registerCommands, type Command } from '../CommandPalette';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { usePersistent } from '../usePersistent';
import { OutOfCredits, refundCredits, spendCredits, useCredits } from '../useCredits';
import { CreditsDialog } from './CreditsDialog';
import { Controls, MODES } from './Controls';
import { Editor } from './Editor';
import { LibraryDrawer } from './LibraryDrawer';
import { StyleNav } from './StyleNav';
import { Progress, type StepView } from './Progress';
import { Results, type Tab } from './Results';
import { SettingsDialog } from './SettingsDialog';

const IDLE: StepView = {
  read: { state: 'idle', msg: 'Waiting' },
  search: { state: 'idle', msg: 'Waiting' },
  rank: { state: 'idle', msg: 'Waiting' },
  format: { state: 'idle', msg: 'Waiting' },
};

const mergePrefs = (p: Prefs): Prefs => ({
  ...DEFAULT_PREFS,
  ...p,
  providers: { ...DEFAULT_PREFS.providers, ...(p && p.providers) },
  style: p && STYLES[p.style] ? p.style : DEFAULT_PREFS.style,
  // the old default let too many loose matches through
  minRel: p && typeof p.minRel === 'number' && p.minRel !== 0.15 ? p.minRel : DEFAULT_PREFS.minRel,
});

export function Studio() {
  const [draft, setDraft] = usePersistent('draft', '');
  const [prefs, setPrefsRaw] = usePersistent<Prefs>('prefs', DEFAULT_PREFS, mergePrefs);
  const [settings, setSettings] = usePersistent<ApiSettings>('settings', {});
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepView>(IDLE);
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [tab, setTab] = useState<Tab>('doc');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [doc, setDocRaw] = usePersistent<DocOptions>('doc', DEFAULT_DOC, (d) => ({ ...DEFAULT_DOC, ...d }));
  const [library, setLibrary] = useState<LibItem[]>([]);
  const { data: session } = useSession();
  const userId = session?.user.id;
  const syncWarned = useRef(false);
  const credits = useCredits(Boolean(userId));
  const [outOf, setOutOf] = useState<{ needed: number; have: number } | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const tracedDraft = useRef('');
  const [highlight, setHighlight] = usePersistent('highlight', true);
  const [citing, setCiting] = useState(false);
  const annotations = useRef<Record<string, string>>({});
  const runToken = useRef(0);
  const progressEl = useRef<HTMLDivElement>(null);
  const resultsEl = useRef<HTMLDivElement>(null);
  const mainEl = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ y: 0, p: 0 });
  const onMainScroll = useCallback(() => {
    const el = mainEl.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScroll({ y: el.scrollTop, p: max > 0 ? el.scrollTop / max : 0 });
  }, []);

  /* Signed out: the library lives in this browser. Signed in: it is merged with
     the account copy, and browser-only traces are uploaded. */
  useEffect(() => {
    const local = loadLibrary();
    setLibrary(local);
    if (!userId) return;
    let live = true;
    syncLibrary(local)
      .then((list) => live && setLibrary(list))
      .catch(() => live && toast('Couldn’t reach your account library. Showing traces in this browser.', true));
    return () => {
      live = false;
    };
  }, [userId]);
  const setDoc = useCallback((p: Partial<DocOptions>) => setDocRaw((d) => ({ ...d, ...p })), [setDocRaw]);

  /* keep the library entry for the open trace up to date */
  useEffect(() => {
    if (!result || !entryId) return;
    const t = setTimeout(() => {
      const text = tracedDraft.current;
      const entry = toSaved(entryId, suggestTitle(text), text, prefs.style, prefs.mode, result);
      const local = upsert(entry);
      if (!userId) return setLibrary(local);
      setLibrary((prev) => [entry, ...prev.filter((x) => x.id !== entry.id)]);
      pushRemote(entry).then(
        () => (syncWarned.current = false),
        (e: Error) => {
          if (syncWarned.current) return;
          syncWarned.current = true;
          toast(`Saved in this browser only: ${e.message}`, true);
        },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [result, entryId, prefs.style, prefs.mode, userId]);

  const deferred = useDeferredValue(draft);
  const analysis = useMemo(() => (deferred.trim() ? analyse(deferred) : null), [deferred]);
  /* what a full trace of the current draft would cost */
  const cost = useMemo(() => (analysis ? chooseClaims(analysis.sentences, Math.min(prefs.count, 40)).length * CREDITS_PER_CLAIM : 0), [analysis, prefs.count]);

  const setPrefs = useCallback(
    (p: Partial<Prefs>) =>
      setPrefsRaw((prev) => {
        const next = { ...prev, ...p };
        if (p.style && STYLES[p.style].family === 'notes' && next.mode === 'intext') next.mode = 'footnotes';
        if (p.mode === 'intext' && STYLES[next.style].family === 'notes') {
          toast(`${STYLES[next.style].name} cites with notes, so footnotes stay on.`);
          next.mode = 'footnotes';
        }
        return next;
      }),
    [setPrefsRaw],
  );

  const rendered = useMemo(
    () => (result ? render(result, prefs.style, prefs.mode, annotations.current) : null),
    [result, prefs.style, prefs.mode],
  );

  const cancel = useCallback(() => {
    runToken.current++;
    setRunning(false);
    setShowProgress(false);
    toast('Tracing stopped');
  }, []);

  const run = useCallback(async () => {
    if (running) return;
    const token = ++runToken.current;
    setRunning(true);
    setShowProgress(true);
    setSteps(IDLE);
    setLog([]);
    setProgress(0);
    setTimeout(() => progressEl.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    let spendId: string | null = null;
    let ok = false;
    try {
      const r = await trace(draft, prefs, settings, {
        charge: async (n) => {
          spendId = await spendCredits(n, 'trace');
        },
        step: (s: Step, state: StepState, msg: string) => token === runToken.current && setSteps((v) => ({ ...v, [s]: { state, msg } })),
        progress: (f) => token === runToken.current && setProgress(f),
        log: (l) => token === runToken.current && setLog((xs) => [...xs.slice(-20), l]),
        isCancelled: () => token !== runToken.current,
      });
      if (!r || token !== runToken.current) return;
      ok = true;
      annotations.current = {};
      tracedDraft.current = draft;
      setEntryId(`t${Date.now().toString(36)}`);
      if (!doc.title.trim()) setDoc({ title: suggestTitle(draft) });
      setResult(r);
      setTab('doc');
      setSteps((v) => ({ ...v, format: { state: 'done', msg: STYLES[prefs.style].name } }));
      const total = r.claims.reduce((n, c) => n + c.ids.length, 0);
      if (!total) toast('No source was relevant enough. Lower the match strictness or switch on more databases.', true);
      setTimeout(() => {
        if (token === runToken.current) setShowProgress(false);
        resultsEl.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 700);
    } catch (e) {
      if (token !== runToken.current) return;
      if (e instanceof OutOfCredits) {
        setShowProgress(false);
        setOutOf({ needed: e.needed, have: e.have });
        return;
      }
      setShowProgress(e instanceof TraceError ? false : true);
      toast((e as Error).message, true);
    } finally {
      if (token === runToken.current) setRunning(false);
      // stopped or failed after paying: give the credits back
      if (spendId && !ok) refundCredits(spendId).then((back) => back && toast('Trace didn’t finish, so its credits were returned'));
    }
  }, [running, draft, prefs, settings, doc.title, setDoc]);

  /* sentences of the draft that already carry a citation */
  const citedTexts = useMemo(() => {
    const set = new Set<string>();
    if (!result) return set;
    result.claims.forEach((c) => {
      if (!c.ids.length) return;
      const s = result.analysis.sentences.find((x) => x.index === c.sid);
      if (s) set.add(s.text);
    });
    return set;
  }, [result]);

  /* cite only the passage the user selected */
  const citeSelection = useCallback(
    async (text: string, start: number, end: number, n: number) => {
      if (citing || running) return false;
      const a = analyse(draft);
      const sid = sentenceForSelection(draft, a, start, end);
      if (sid == null) {
        toast('Select text inside a sentence of your draft.', true);
        return false;
      }
      setCiting(true);
      let spendId: string | null = null;
      let ok = false;
      try {
        spendId = await spendCredits(1, 'cite');
        const found = await traceClaim(text.trim(), prefs, settings, n, result ? citedSet(result) : new Set(), topicTokens(a));
        if (!found.ids.length) {
          toast('No matching source was found for that passage. Try selecting a longer or more specific claim.', true);
          return false;
        }
        const next = attachClaim(result, a, sid, text.trim().replace(/\s+/g, ' '), found, n);
        tracedDraft.current = draft;
        if (!entryId) setEntryId(`t${Date.now().toString(36)}`);
        if (!doc.title.trim()) setDoc({ title: suggestTitle(draft) });
        setResult(next);
        setTab('doc');
        setShowProgress(false);
        toast(`${found.ids.length} source${found.ids.length === 1 ? '' : 's'} added for that claim`);
        ok = true;
        return true;
      } catch (e) {
        if (e instanceof OutOfCredits) setOutOf({ needed: e.needed, have: e.have });
        else toast((e as Error).message, true);
        return false;
      } finally {
        setCiting(false);
        if (spendId && !ok) refundCredits(spendId);
      }
    },
    [citing, running, draft, prefs, settings, result, entryId, doc.title, setDoc],
  );

  /* command palette entries for this page */
  useEffect(() => {
    const cmds: Command[] = [
      { id: 'run', group: 'Studio', label: 'Trace sources', icon: 'search', meta: 'Ctrl Enter', run: () => run() },
      { id: 'settings', group: 'Studio', label: 'Database settings', icon: 'gear', run: () => setSettingsOpen(true) },
      { id: 'library', group: 'Studio', label: 'Open the library of recent traces', icon: 'history', keywords: 'history recent saved', run: () => setLibOpen(true) },
      ...Object.entries(SAMPLES).map(([k, s]) => ({
        id: 'sample-' + k, group: 'Studio', label: `Load the sample “${s.label}”`, icon: 'doc' as const, run: () => setDraft(s.text),
      })),
      ...STYLE_GROUPS.flatMap(([g, ids]) =>
        ids.map((id) => ({
          id: 'style-' + id, group: 'Citation style', label: `${STYLES[id].name}, ${STYLES[id].edition}`, meta: g,
          icon: 'quote' as const, keywords: 'style format cite', run: () => { setPrefs({ style: id }); toast(`Style set to ${STYLES[id].name}`); },
        })),
      ),
      ...MODES.map((m) => ({
        id: 'mode-' + m.id, group: 'Output', label: m.label, icon: 'list' as const, keywords: 'output form mode',
        run: () => setPrefs({ mode: m.id as Mode }),
      })),
    ];
    if (result) {
      cmds.push(
        ...(['doc', 'refs', 'sources', 'map', 'insights', 'export'] as Tab[]).map((t) => ({
          id: 'tab-' + t, group: 'Results', label: `Show ${{ doc: 'manuscript', refs: 'references', sources: 'source cards', map: 'source map', insights: 'insights', export: 'export' }[t]}`,
          icon: 'arrow' as const, run: () => { setTab(t); resultsEl.current?.scrollIntoView({ behavior: 'smooth' }); },
        })),
      );
    }
    if (result) {
      cmds.push(
        { id: 'dl-doc', group: 'Results', label: 'Download as Word or PDF', icon: 'download', keywords: 'export docx pdf print word', run: () => { setTab('export'); resultsEl.current?.scrollIntoView({ behavior: 'smooth' }); } },
      );
    }
    return registerCommands('studio', cmds);
  }, [run, setPrefs, setDraft, result]);

  const onReplace = (oldId: string, newId: string) => {
    if (!result) return;
    const next = replaceSource(result, oldId, newId);
    if (!next) return toast('That work is already in your list.');
    setResult(next);
    toast('Source replaced');
    const s = next.db.get(newId);
    if (s && s.doi && (!s.pages || !s.volume)) {
      enrich(s, settings).then((full) => setResult((r) => (r && r.db.has(newId) ? { ...r, db: new Map(r.db).set(newId, full) } : r)));
    }
  };
  const onPin = (id: string, pin: string) => {
    setResult((r) => (r ? { ...r, pins: { ...(r.pins || {}), [id]: pin } } : r));
  };
  const openEntry = async (item: LibItem) => {
    let it: Saved;
    if (item.result) it = item as Saved;
    else {
      try {
        it = await fetchRemote(item.id);
      } catch (e) {
        toast((e as Error).message, true);
        return;
      }
    }
    annotations.current = {};
    tracedDraft.current = it.draft;
    setDraft(it.draft);
    setPrefs({ style: it.style, mode: it.mode as Mode });
    setResult(fromSaved(it));
    setEntryId(it.id);
    setDoc({ title: it.title });
    setTab('doc');
    setLibOpen(false);
    setShowProgress(false);
    setTimeout(() => resultsEl.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const onRemove = (id: string) => {
    if (!result) return;
    setResult(removeSource(result, id));
    toast('Source removed');
  };
  const onAdd = (s: Source, ci: number) => {
    if (!result) return;
    const { result: next, message } = addSource(result, s, ci);
    setResult(next);
    toast(message);
  };

  return (
    <div className="shell">
      <div className="ws-bar">
        <div className="ws-bar-in">
          <div className="ws-title">
            <input
              value={doc.title}
              onChange={(e) => setDoc({ title: e.target.value })}
              placeholder="Untitled draft"
              aria-label="Document title"
              spellCheck={false}
            />
            <span className="ws-saved">
              <Icon name="check" /> {userId ? 'Saved to your account' : 'Saved in this browser'}
            </span>
            {credits && (
              <Link href="/pricing" className={`ws-credits${credits.total < Math.max(cost, 5) ? ' low' : ''}`} title={`${credits.free} free (resets monthly) + ${credits.paid} purchased`}>
                <Icon name="bolt" /> {credits.total.toLocaleString()} credit{credits.total === 1 ? '' : 's'}
              </Link>
            )}
          </div>
          <div className="ws-actions">
            <button className="ws-btn" onClick={() => setLibOpen(true)} title="Recent traces">
              <Icon name="history" />
              <span>Library</span>
              {library.length ? <span className="ws-count">{library.length}</span> : null}
            </button>
            <button className="ws-btn" onClick={() => setSettingsOpen(true)} title="Database settings">
              <Icon name="gear" />
              <span>Settings</span>
            </button>
            <span className="ws-sep" aria-hidden="true" />
            {running ? (
              <button className="btn btn-ghost btn-sm" onClick={cancel}>
                <Icon name="stop" /> Stop
              </button>
            ) : (
              <button className="btn btn-thread btn-sm ws-run" onClick={run}>
                <Icon name="search" /> Trace all claims
                {cost > 0 && <span className="ws-cost">{cost} credit{cost === 1 ? '' : 's'}</span>}
                <span className="kbd">Ctrl ↵</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ws-grid">
        <StyleNav value={prefs.style} onChange={(id) => setPrefs({ style: id })} />

        <div className={`ws-main${scroll.y > 4 ? ' is-scrolled' : ''}`} ref={mainEl} onScroll={onMainScroll}>
          <div className="ws-progress" aria-hidden="true">
            <i style={{ transform: `scaleX(${scroll.p})` }} />
          </div>
          <div className="ws-main-in">
            <Editor
              value={draft}
              onChange={setDraft}
              analysis={analysis}
              cited={citedTexts}
              highlight={highlight}
              setHighlight={setHighlight}
              onRun={run}
              onCite={citeSelection}
              citing={citing}
            />

            <div ref={progressEl}>
              {showProgress && <Progress steps={steps} log={log} progress={progress} running={running} onCancel={cancel} />}
            </div>

            <div ref={resultsEl} style={{ scrollMarginTop: 16 }}>
              {result && rendered ? (
                <Results
                  result={result}
                  rendered={rendered}
                  prefs={prefs}
                  setPrefs={setPrefs}
                  tab={tab}
                  setTab={setTab}
                  annotations={annotations}
                  onReplace={onReplace}
                  doc={doc}
                  setDoc={setDoc}
                  onRemove={onRemove}
                  onAdd={onAdd}
                  onPin={onPin}
                />
              ) : (
                !showProgress && (
                  <div className="res-empty">
                    <Icon name="thread" />
                    <p>
                      Trace all claims, or select a passage in your draft and choose “Cite this claim”. Your cited
                      manuscript, references, sources and source map will appear here.
                    </p>
                  </div>
                )
              )}
            </div>

            <button
              className={`to-top${scroll.y > 700 ? ' show' : ''}`}
              onClick={() => mainEl.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Back to the top"
              tabIndex={scroll.y > 700 ? 0 : -1}
            >
              <Icon name="chevron" />
            </button>

            <p className="ws-foot">
              Records come from OpenAlex, Crossref, Open Library and Wikipedia. Open every source and check it before you
              rely on it.
            </p>
          </div>
        </div>

        <Controls prefs={prefs} set={setPrefs} analysis={analysis} />
      </div>

      {libOpen && (
        <LibraryDrawer
          items={library}
          signedIn={Boolean(userId)}
          currentId={entryId}
          onOpen={openEntry}
          onDelete={(id) => {
            const local = removeEntry(id);
            if (userId) {
              setLibrary((prev) => prev.filter((x) => x.id !== id));
              deleteRemote(id).catch((e: Error) => toast(e.message, true));
            } else setLibrary(local);
            if (id === entryId) setEntryId(null);
            toast('Deleted from the library');
          }}
          onClose={() => setLibOpen(false)}
        />
      )}

      {outOf && <CreditsDialog needed={outOf.needed} have={outOf.have} resetsAt={credits?.resetsAt} onClose={() => setOutOf(null)} />}

      {settingsOpen && (
        <SettingsDialog
          value={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(v) => {
            setSettings(v);
            setSettingsOpen(false);
            toast('Settings saved');
          }}
        />
      )}
    </div>
  );
}
