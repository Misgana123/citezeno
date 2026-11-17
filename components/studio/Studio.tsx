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
import { ACCOUNT_MAX, ACCOUNT_NOTICE, LOCAL_MAX, evictionFor, fromSaved, loadLibrary, removeEntry, toSaved, upsert, type Saved } from '@/lib/library';
import { SAMPLES } from '@/lib/samples';
import { STYLES, STYLE_GROUPS } from '@/lib/styles';
import { enrich } from '@/lib/sources';
import { analyse, chooseClaims, isEligible, locate, topicTokens } from '@/lib/text';
import { CREDITS_PER_CLAIM } from '@/lib/pricing';
import { emptyHistory, isTextTarget, record, redo, undo, undoKey, type History } from '@/lib/undo';
import { DEFAULT_PREFS, type ApiSettings, type Mode, type Prefs, type Result, type Source } from '@/lib/types';
import { CreditsPill, RailLink, openPalette } from '../app/AppShell';
import { registerCommands, type Command } from '../CommandPalette';
import { Icon, LogoMark, type IconName } from '../Icon';
import { ThemeToggle } from '../Nav';
import { UserMenu } from '../UserMenu';
import { toast } from '../toast';
import { usePersistent } from '../usePersistent';
import { OutOfCredits, refundCredits, spendCredits, useCredits } from '../useCredits';
import { CreditsDialog } from './CreditsDialog';
import { EvictDialog } from './EvictDialog';
import { Controls, MODES } from './Controls';
import { Editor, type EditorApi } from './Editor';
import { LibraryDrawer } from './LibraryDrawer';
import { SidePanel, type OutlineClaim, type SideTab } from './SidePanel';
import { Progress, type StepView } from './Progress';
import { Results, type Tab } from './Results';
import { SettingsDialog } from './SettingsDialog';
import { ShareDialog } from '../share/ShareDialog';

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
  /* undo/redo for source edits; it starts again with each new trace */
  const [hist, setHist] = useState<History<Result>>(emptyHistory);
  const resultRef = useRef(result);
  resultRef.current = result;
  const histRef = useRef(hist);
  histRef.current = hist;
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepView>(IDLE);
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [tab, setTab] = useState<Tab>('doc');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  /* on narrow screens the side panels open as drawers */
  const [drawer, setDrawer] = useState<'' | 'nav' | 'insp'>('');
  const [sideTab, setSideTab] = usePersistent<SideTab>('side-tab', 'style');
  const editorApi = useRef<EditorApi | null>(null);
  const [doc, setDocRaw] = usePersistent<DocOptions>('doc', DEFAULT_DOC, (d) => ({ ...DEFAULT_DOC, ...d }));
  const [library, setLibrary] = useState<LibItem[]>([]);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  /* whether the account's list has been loaded, so its size is known */
  const accountKnown = useRef(false);
  /* saving a new trace into a full library asks first (see EvictDialog) */
  const [evict, setEvict] = useState<{ victim: LibItem; entryId: string } | null>(null);
  const evictOk = useRef<string | null>(null);
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const nearFullTold = useRef(false);
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
    accountKnown.current = false;
    if (!userId) return;
    let live = true;
    syncLibrary(local)
      .then((list) => {
        if (!live) return;
        accountKnown.current = true;
        setLibrary(list);
      })
      .catch(() => live && toast('Couldn’t reach your account library. Showing traces in this browser.', true));
    return () => {
      live = false;
    };
  }, [userId]);
  const setDoc = useCallback((p: Partial<DocOptions>) => setDocRaw((d) => ({ ...d, ...p })), [setDocRaw]);

  /* keep the library entry for the open trace up to date */
  useEffect(() => {
    if (!result || !entryId || unsaved === entryId) return;
    const t = setTimeout(() => {
      const lib = libraryRef.current;
      const isNew = !lib.some((x) => x.id === entryId);
      // a full library loses its oldest trace: ask before that happens
      if (isNew && evictOk.current !== entryId) {
        const cap = userId ? (accountKnown.current ? ACCOUNT_MAX : Infinity) : LOCAL_MAX;
        const victim = evictionFor(lib, entryId, cap);
        if (victim) return setEvict({ victim, entryId });
      }
      const text = tracedDraft.current;
      const entry = toSaved(entryId, suggestTitle(text), text, prefs.style, prefs.mode, result);
      const local = upsert(entry);
      if (!userId) return setLibrary(local);
      // the account keeps its newest ACCOUNT_MAX traces
      setLibrary((prev) => [entry, ...prev.filter((x) => x.id !== entry.id)].sort((a, b) => b.savedAt - a.savedAt).slice(0, ACCOUNT_MAX));
      if (isNew && accountKnown.current && lib.length + 1 >= ACCOUNT_NOTICE && !nearFullTold.current) {
        nearFullTold.current = true;
        toast(`Your library holds ${Math.min(lib.length + 1, ACCOUNT_MAX)} of ${ACCOUNT_MAX} traces. Download or delete old ones to make room.`);
      }
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
  }, [result, entryId, prefs.style, prefs.mode, userId, unsaved, saveTick]);

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
      setHist(emptyHistory());
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

  /* every sentence worth citing, for the claims outline */
  const outline = useMemo<OutlineClaim[]>(() => {
    if (!analysis) return [];
    const spans = new Map(locate(deferred, analysis.sentences).map((sp) => [sp.index, sp]));
    const sources = new Map<string, number>();
    result?.claims.forEach((c) => {
      if (!c.ids.length) return;
      const st = result.analysis.sentences.find((x) => x.index === c.sid);
      if (st) sources.set(st.text, c.ids.length);
    });
    return analysis.sentences
      .filter((st) => sources.has(st.text) || isEligible(st))
      .map((st) => {
        const sp = spans.get(st.index);
        const sc = st.score || 0;
        return { index: st.index, text: st.text, start: sp ? sp.start : -1, end: sp ? sp.end : -1, level: sc > 1.8 ? 3 : sc > 1.1 ? 2 : 1, sources: sources.get(st.text) || 0 };
      });
  }, [analysis, deferred, result]);

  const jumpTo = useCallback((c: OutlineClaim) => {
    if (c.start < 0) return;
    setDrawer('');
    // wait for a drawer to slide away before moving the focus
    setTimeout(() => editorApi.current?.select(c.start, c.end), 40);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer('');
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [drawer]);

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
        // a paid result: earlier steps can't be undone past it
        setHist(emptyHistory());
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

  /* apply a source edit, remembering the previous result for undo */
  const edit = (next: Result, label: string, key?: string) => {
    const prev = resultRef.current;
    if (!prev) return;
    setHist((h) => record(h, prev, label, key));
    setResult(next);
  };
  const step = useCallback((dir: 'undo' | 'redo') => {
    const r = resultRef.current;
    if (!r) return;
    const s = (dir === 'undo' ? undo : redo)(histRef.current, r);
    if (!s) return;
    setHist(s.history);
    setResult(s.value);
    toast(`${dir === 'undo' ? 'Undone' : 'Redone'}: ${s.label}`);
  }, []);
  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  /* Ctrl+Z / Ctrl+Shift+Z (Cmd on a Mac), unless the focus is in a text field */
  useEffect(() => {
    if (!result) return;
    const k = (e: KeyboardEvent) => {
      const a = undoKey(e);
      if (!a || isTextTarget(e.target)) return;
      e.preventDefault();
      step(a);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [result, step]);

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
        { id: 'undo', group: 'Results', label: 'Undo the last source change', icon: 'undo' as const, meta: 'Ctrl Z', keywords: 'undo revert back', run: () => step('undo') },
        { id: 'redo', group: 'Results', label: 'Redo the source change', icon: 'redo' as const, meta: 'Ctrl Shift Z', keywords: 'redo again forward', run: () => step('redo') },
        { id: 'dl-doc', group: 'Results', label: 'Download as Word or PDF', icon: 'download', keywords: 'export docx pdf print word', run: () => { setTab('export'); resultsEl.current?.scrollIntoView({ behavior: 'smooth' }); } },
      );
    }
    return registerCommands('studio', cmds);
  }, [run, setPrefs, setDraft, result, step]);

  const onReplace = (oldId: string, newId: string) => {
    if (!result) return;
    const next = replaceSource(result, oldId, newId);
    if (!next) return toast('That work is already in your list.');
    edit(next, 'source replaced');
    toast('Source replaced');
    const s = next.db.get(newId);
    if (s && s.doi && (!s.pages || !s.volume)) {
      enrich(s, settings).then((full) => setResult((r) => (r && r.db.has(newId) ? { ...r, db: new Map(r.db).set(newId, full) } : r)));
    }
  };
  const onPin = (id: string, pin: string) => {
    if (!result) return;
    edit({ ...result, pins: { ...(result.pins || {}), [id]: pin } }, 'page number changed', `pin:${id}`);
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
    setHist(emptyHistory());
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
  /* the share dialog: pick a design, preview the public page, then create the link */
  const openShare = () => {
    if (!result || !entryId) return toast('Trace your draft first, then share it.', true);
    if (unsaved === entryId) return toast('Save this trace to your library first (“Save” at the top), then share it.', true);
    setShareOpen(true);
  };

  /* /studio?open=<id> (from the library page) opens that trace */
  useEffect(() => {
    if (!userId) return;
    const id = new URLSearchParams(window.location.search).get('open');
    if (!id) return;
    window.history.replaceState(null, '', '/studio');
    const local = loadLibrary().find((x) => x.id === id);
    openEntry(local ?? ({ id } as LibItem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onRemove = (id: string) => {
    if (!result) return;
    edit(removeSource(result, id), 'source removed');
    toast('Source removed');
  };
  const onAdd = (s: Source, ci: number) => {
    if (!result) return;
    const { result: next, message } = addSource(result, s, ci);
    edit(next, 'source added');
    toast(message);
  };

  const st = STYLES[prefs.style];
  const dbsOn = Object.values(prefs.providers).filter(Boolean).length;
  /* `short` is the caption under the icon when the rail is the phone's bottom bar */
  const rail = (icon: IconName, label: string, onClick: () => void, opts: { badge?: number; cls?: string; current?: boolean; short?: string } = {}) => (
    <button className={`at-rb${opts.cls ? ' ' + opts.cls : ''}`} onClick={onClick} aria-label={label} aria-current={opts.current ? 'page' : undefined}>
      <Icon name={icon} />
      {opts.badge ? <span className="at-rb-badge">{opts.badge > 99 ? '99+' : opts.badge}</span> : null}
      <span className="at-rb-lbl" data-short={opts.short}>{label}</span>
    </button>
  );

  return (
    <div className={`at${drawer === 'nav' ? ' is-nav' : ''}${drawer === 'insp' ? ' is-insp' : ''}`}>
      <nav className="at-rail" aria-label="Studio navigation">
        <Link className="at-logo" href="/" aria-label="Citezeno home">
          <LogoMark className="at-logo-mark" />
        </Link>
        <div className="at-rail-main">
          {rail('doc', 'Studio', () => mainEl.current?.scrollTo({ top: 0, behavior: 'smooth' }), { current: true, cls: 'at-hide-phone' })}
          {rail('history', 'Library', () => setLibOpen(true), { badge: library.length })}
          {rail('quote', 'Style and claims', () => setDrawer('nav'), { cls: 'at-only-compact', short: 'Style' })}
          {rail('sliders', 'Trace settings', () => setDrawer('insp'), { cls: 'at-only-compact', short: 'Settings' })}
          {rail('search', 'Commands', openPalette, { cls: 'at-only-phone', short: 'Search' })}
          <RailLink href="/history" icon="clock" label="History" cls="at-hide-phone" />
        </div>
        <div className="at-rail-end">
          <RailLink href="/#method" icon="help" label="How it works" cls="at-hide-phone" />
          {rail('gear', 'Database settings', () => setSettingsOpen(true), { short: 'Databases' })}
        </div>
      </nav>

      <header className="at-top">
        <Link className="at-top-logo" href="/" aria-label="Citezeno home">
          <LogoMark className="at-logo-mark" />
        </Link>
        <div className="at-doc">
          <span className="at-crumb">Studio</span>
          <span className="at-crumb-sep" aria-hidden="true">/</span>
          <input value={doc.title} onChange={(e) => setDoc({ title: e.target.value })} placeholder="Untitled draft" aria-label="Document title" spellCheck={false} />
          {entryId && unsaved === entryId ? (
            <button className="at-saved is-off" onClick={() => setUnsaved(null)} title="This trace isn’t in your library. Click to save it.">
              <Icon name="alert" /> <span>Not saved · Save</span>
            </button>
          ) : (
            <span className="at-saved" title={userId ? 'Saved to your account' : 'Saved in this browser'}>
              <Icon name="check" /> <span>{userId ? 'Saved to your account' : 'Saved in this browser'}</span>
            </span>
          )}
        </div>
        <button className="at-cmdk" onClick={openPalette} aria-label="Open the command menu">
          <Icon name="search" />
          <span>Search commands</span>
          <span className="kbd">Ctrl K</span>
        </button>
        <CreditsPill need={cost} />
        {userId && result && (
          <button className="at-tbtn" onClick={openShare} title="Share a read-only link to this trace">
            <Icon name="globe" />
            <span>Share</span>
          </button>
        )}
        {running ? (
          <button className="at-run stop" onClick={cancel}>
            <Icon name="stop" /> <span>Stop</span>
          </button>
        ) : (
          <button className="at-run" onClick={run}>
            <Icon name="search" /> <span className="at-run-lbl">Trace all claims</span>
            {cost > 0 && <span className="at-run-cost">{cost} credit{cost === 1 ? '' : 's'}</span>}
            <span className="kbd">Ctrl ↵</span>
          </button>
        )}
        <span className="at-top-sep" aria-hidden="true" />
        <ThemeToggle />
        <UserMenu />
      </header>

      <SidePanel
        tab={sideTab}
        setTab={setSideTab}
        style={prefs.style}
        onStyle={(id) => setPrefs({ style: id })}
        claims={outline}
        onJump={jumpTo}
        hasDraft={Boolean(draft.trim())}
        onClose={() => setDrawer('')}
      />

      <div className={`at-main${scroll.y > 4 ? ' is-scrolled' : ''}`} ref={mainEl} onScroll={onMainScroll}>
        <div className="at-progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${scroll.p})` }} />
        </div>
        <div className="at-main-in">
          <div className="at-context">
            <button onClick={() => { setSideTab('style'); setDrawer('nav'); }}>
              <Icon name="quote" />
              <span>
                <small>Style</small>
                <b>{st.name}, {st.edition}</b>
              </span>
              <Icon name="chevron" className="at-context-chev" />
            </button>
            <button onClick={() => setDrawer('insp')}>
              <Icon name="sliders" />
              <span>
                <small>Trace settings</small>
                <b>{MODES.find((m) => m.id === prefs.mode)?.label} · {prefs.count} source{prefs.count === 1 ? '' : 's'} · {dbsOn} database{dbsOn === 1 ? '' : 's'}</b>
              </span>
              <Icon name="chevron" className="at-context-chev" />
            </button>
            {outline.length > 0 && (
              <button className="at-context-claims" onClick={() => { setSideTab('claims'); setDrawer('nav'); }}>
                <Icon name="thread" />
                <span>
                  <small>Claims</small>
                  <b>{outline.filter((c) => c.sources).length} of {outline.length} cited</b>
                </span>
                <Icon name="chevron" className="at-context-chev" />
              </button>
            )}
          </div>

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
            api={editorApi}
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
                history={{ canUndo, canRedo, undoLabel: hist.past[hist.past.length - 1]?.label, redoLabel: hist.future[hist.future.length - 1]?.label, onUndo: () => step('undo'), onRedo: () => step('redo') }}
              />
            ) : (
              !showProgress && (
                <div className="at-res-empty">
                  <span className="at-res-empty-ico">
                    <Icon name="thread" />
                  </span>
                  <b>Your cited manuscript will appear here</b>
                  <p>
                    Trace all claims, or select a passage in your draft and choose “Cite this claim”. Your cited manuscript,
                    references, sources and source map will appear here.
                  </p>
                  <ul>
                    <li><Icon name="doc" /> Manuscript</li>
                    <li><Icon name="list" /> References</li>
                    <li><Icon name="cards" /> Sources</li>
                    <li><Icon name="map" /> Map</li>
                    <li><Icon name="chart" /> Insights</li>
                    <li><Icon name="code" /> Export</li>
                  </ul>
                </div>
              )
            )}
          </div>

          <button
            className={`at-to-top${scroll.y > 700 ? ' show' : ''}`}
            onClick={() => mainEl.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to the top"
            tabIndex={scroll.y > 700 ? 0 : -1}
          >
            <Icon name="chevron" />
          </button>

          <p className="at-foot">
            Records come from OpenAlex, Crossref, Open Library and Wikipedia. Open every source and check it before you
            rely on it.
          </p>
        </div>
      </div>

      <Controls prefs={prefs} set={setPrefs} analysis={analysis} cost={cost} onSettings={() => setSettingsOpen(true)} onClose={() => setDrawer('')} />

      {drawer && <div className="at-scrim" onClick={() => setDrawer('')} aria-hidden="true" />}

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

      {evict && (
        <EvictDialog
          victim={evict.victim}
          cap={userId ? ACCOUNT_MAX : LOCAL_MAX}
          signedIn={Boolean(userId)}
          onContinue={() => {
            evictOk.current = evict.entryId;
            setEvict(null);
            setUnsaved(null);
            setSaveTick((n) => n + 1);
          }}
          onCancel={() => {
            setUnsaved(evict.entryId);
            setEvict(null);
            toast('Not saved to your library. Use “Save” at the top when you want to keep it.');
          }}
        />
      )}

      {outOf && <CreditsDialog needed={outOf.needed} have={outOf.have} resetsAt={credits?.resetsAt} onClose={() => setOutOf(null)} />}
      {shareOpen && result && entryId && (
        <ShareDialog
          id={entryId}
          title={suggestTitle(tracedDraft.current)}
          owner={session?.user.name || ''}
          saved={toSaved(entryId, suggestTitle(tracedDraft.current), tracedDraft.current, prefs.style, prefs.mode, result)}
          onClose={() => setShareOpen(false)}
        />
      )}

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
