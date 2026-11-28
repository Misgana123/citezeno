'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SearchResult } from '@/lib/search';
import { Icon, type IconName } from './Icon';
import { readHref } from './reader/api';
import { openSettings } from './settings/open';

/* Search (Ctrl K): one box for the user's chats, the papers on their shelf,
   their citation drafts, and actions (going somewhere, page commands).
   Tabs narrow it to one kind; with no words it shows what was used recently.
   Tab hands the words to the assistant as a new chat. */

export type Command = { id: string; group: string; label: string; meta?: string; icon?: IconName; keywords?: string; run: () => void };

/* ---- a tiny registry pages can add commands to ---- */
const sets = new Map<string, Command[]>();
const listeners = new Set<() => void>();
let snapshot: Command[] = [];
const emit = () => {
  snapshot = [...sets.values()].flat();
  listeners.forEach((l) => l());
};
export function registerCommands(key: string, cmds: Command[]) {
  sets.set(key, cmds);
  emit();
  return () => {
    sets.delete(key);
    emit();
  };
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Command[] = [];

/* ---- result sources pages can add: a tab of their own (the docs give "Docs"), opened first on that page ---- */
export type SourceResult = { id: string; group: string; title: string; sub?: string; icon: IconName; href: string };
export type Source = { tab: string; label: string; placeholder?: string; results: SourceResult[] };
const sources = new Map<string, Source>();
const sourceListeners = new Set<() => void>();
let sourceSnapshot: Source[] = [];
export function registerSource(key: string, source: Source) {
  sources.set(key, source);
  sourceSnapshot = [...sources.values()];
  sourceListeners.forEach((l) => l());
  return () => {
    sources.delete(key);
    sourceSnapshot = [...sources.values()];
    sourceListeners.forEach((l) => l());
  };
}
const subscribeSources = (l: () => void) => {
  sourceListeners.add(l);
  return () => sourceListeners.delete(l);
};
const NO_SOURCES: Source[] = [];

/* a source's results grouped into sections; with no words only its first group is listed */
function sourceSections(src: Source, q: string, cap: number): { label: string; results: SourceResult[] }[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const groups = [...new Set(src.results.map((r) => r.group))];
  if (!words.length) return groups.slice(0, 1).map((g) => ({ label: g, results: src.results.filter((r) => r.group === g) }));
  return groups.map((g) => ({ label: g, results: src.results.filter((r) => r.group === g && words.every((w) => `${r.title} ${r.sub || ''}`.toLowerCase().includes(w))).slice(0, cap) }));
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'chats', label: 'Chats' },
  { id: 'papers', label: 'Papers' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'actions', label: 'Actions' },
] as const;
type Tab = (typeof TABS)[number]['id'] | (string & {});

type Row = { key: string; icon: IconName; title: string; sub?: string | null; meta?: string; flag?: string; go: () => void };
type Section = { label: string; rows: Row[] };

const NO_RESULTS: SearchResult = { chats: [], papers: [], drafts: [] };

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function CommandPalette() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sel, setSel] = useState(0);
  const [found, setFound] = useState<SearchResult>(NO_RESULTS);
  const [loading, setLoading] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const extra = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
  const pageSources = useSyncExternalStore(
    subscribeSources,
    () => sourceSnapshot,
    () => NO_SOURCES,
  );
  /* a page with its own results (the docs) searches only those: no chats, papers, drafts or actions */
  const pageOnly = pageSources.length > 0;
  const tabs = useMemo(() => (pageOnly ? pageSources.map((s) => ({ id: s.tab, label: s.label })) : [...TABS]), [pageSources, pageOnly]);
  const firstTab: Tab = pageSources[0]?.tab ?? 'all';
  const inApp = path?.startsWith('/app') ?? false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('citezeno:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('citezeno:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setTab(firstTab);
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  /* the user's chats, papers and drafts, a moment after they stop typing */
  useEffect(() => {
    if (!open || tab === 'actions' || signedOut || pageOnly) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/search?${new URLSearchParams({ q: q.trim(), type: tab })}`, { cache: 'no-store', signal: ctrl.signal });
          if (res.status === 401) setSignedOut(true);
          else if (res.ok) setFound((await res.json()) as SearchResult);
        } catch {
          /* aborted or offline: keep what is shown */
        } finally {
          if (!ctrl.signal.aborted) setLoading(false);
        }
      },
      q.trim() ? 160 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, q, tab, signedOut, pageOnly]);

  const actions: Command[] = useMemo(() => {
    const flipTheme = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem('cz:theme', next);
      } catch {
        /* ignore */
      }
    };
    const go = (href: string) => () => router.push(href);
    return [
      { id: 'new-chat', group: 'Actions', label: 'New chat', icon: 'plus', keywords: 'assistant ask agent', run: go('/app/chat') },
      { id: 'go-citation', group: 'Actions', label: 'Citation', icon: 'doc', keywords: 'studio cite trace draft', run: go('/app/citation') },
      { id: 'go-papers', group: 'Actions', label: 'Explore papers', icon: 'compass', keywords: 'find search browse explore research papers articles openalex literature', run: go('/app/papers') },
      { id: 'go-shelf', group: 'Actions', label: 'My shelf', icon: 'layers', keywords: 'shelf saved papers keep reading list projects', run: go('/app/shelf') },
      { id: 'go-history', group: 'Actions', label: 'History', icon: 'clock', keywords: 'activity log timeline past', run: go('/app/history') },
      { id: 'go-account', group: 'Actions', label: 'Settings', icon: 'gear', keywords: 'account profile password sign in credits skills theme', run: () => openSettings('account') },
      { id: 'go-pricing', group: 'Actions', label: 'Pricing and credits', icon: 'bolt', keywords: 'buy credits plan billing', run: go('/pricing') },
      { id: 'go-styles', group: 'Actions', label: 'Citation styles', icon: 'quote', keywords: 'apa mla chicago harvard', run: go('/styles') },
      { id: 'theme', group: 'Actions', label: 'Switch light or dark theme', icon: 'moon', keywords: 'appearance', run: flipTheme },
      { id: 'go-contact', group: 'Actions', label: 'Contact us', icon: 'mail', keywords: 'email help support feedback', run: go('/contact') },
      ...extra,
    ];
  }, [extra, router]);

  const matchedActions = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return actions.filter((c) => {
      const hay = `${c.group} ${c.label} ${c.meta || ''} ${c.keywords || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [actions, q]);

  const sections: Section[] = useMemo(() => {
    const push = (href: string) => () => router.push(href);
    const chatRows = found.chats.map((c): Row => ({
      key: `c:${c.id}`,
      icon: c.paperId ? 'book' : 'chat',
      title: c.title,
      sub: c.snippet,
      meta: when(c.at),
      go: push(c.paperId ? `${readHref(c.paperId)}?chat=${encodeURIComponent(c.id)}` : `/app/chat?c=${encodeURIComponent(c.id)}`),
    }));
    // papers open in the reader
    const paperRows = found.papers.map((p): Row => ({
      key: `p:${p.itemId}`,
      icon: 'layers',
      title: p.title,
      sub: [p.authors, p.year].filter(Boolean).join(' · ') || null,
      flag: p.retracted ? 'Retracted' : undefined,
      go: push(readHref(p.paperId)),
    }));
    const readingRows = (found.reading ?? []).map((r): Row => ({
      key: `r:${r.paperId}`,
      icon: 'book',
      title: r.title,
      sub: r.pageCount ? `Page ${r.page} of ${r.pageCount}` : `Page ${r.page}`,
      meta: when(r.at),
      go: push(readHref(r.paperId)),
    }));
    const draftRows = found.drafts.map((d): Row => ({ key: `d:${d.id}`, icon: 'doc', title: d.title, sub: d.snippet, meta: when(d.at), go: push(`/app/citation?open=${encodeURIComponent(d.id)}`) }));
    const actionRows = (list: Command[]) => list.map((c): Row => ({ key: `a:${c.id}`, icon: c.icon || 'arrow', title: c.label, meta: c.meta, go: c.run }));
    const searching = q.trim().length > 0;
    const sourceRows = (src: Source, cap: number): Section[] =>
      sourceSections(src, q, cap).map((g) => ({ label: g.label, rows: g.results.map((r): Row => ({ key: `s:${src.tab}:${r.id}`, icon: r.icon, title: r.title, sub: r.sub, go: push(r.href) })) }));
    const current = pageSources.find((s) => s.tab === tab);
    if (current) return sourceRows(current, 12);

    if (tab === 'chats') return [{ label: searching ? 'Chats' : 'Recent chats', rows: chatRows }];
    if (tab === 'papers')
      return [
        { label: 'Continue reading', rows: readingRows },
        { label: searching ? 'Papers on your shelf' : 'Recently saved papers', rows: paperRows },
      ];
    if (tab === 'drafts') return [{ label: searching ? 'Drafts' : 'Recent drafts', rows: draftRows }];
    if (tab === 'actions') return [{ label: 'Actions', rows: actionRows(matchedActions) }];
    if (!searching) {
      // recents: what was used last, of every kind
      const dated = [
        ...found.chats.map((c, i) => ({ at: c.at, row: chatRows[i] })),
        ...found.drafts.map((d, i) => ({ at: d.at, row: draftRows[i] })),
        ...found.papers.slice(0, 3).map((p, i) => ({ at: p.at, row: paperRows[i] })),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return [
        { label: 'Continue reading', rows: readingRows },
        { label: 'Recents', rows: dated.slice(0, 8).map((d) => d.row) },
        { label: 'Actions', rows: actionRows(actions.slice(0, inApp ? 3 : 6)) },
      ];
    }
    return [
      { label: 'Chats', rows: chatRows },
      { label: 'Continue reading', rows: readingRows },
      { label: 'Papers on your shelf', rows: paperRows },
      { label: 'Drafts', rows: draftRows },
      { label: 'Actions', rows: actionRows(matchedActions.slice(0, 5)) },
    ];
  }, [found, tab, q, matchedActions, actions, router, inApp, pageSources]);

  const visible = sections.filter((s) => s.rows.length);
  const rows = visible.flatMap((s) => s.rows);

  useEffect(() => setSel(0), [q, tab]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const close = useCallback(() => setOpen(false), []);
  const exec = (r: Row | undefined) => {
    if (!r) return;
    setOpen(false);
    r.go();
  };
  const ask = () => {
    const text = q.trim();
    setOpen(false);
    router.push(text ? `/app/chat?ask=${encodeURIComponent(text)}` : '/app/chat');
  };
  const moveTab = (d: number) => {
    const i = tabs.findIndex((t) => t.id === tab);
    setTab(tabs[(i + d + tabs.length) % tabs.length].id);
  };

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(rows.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      exec(rows[sel]);
    } else if (e.key === 'Escape') {
      close();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && (!q || e.altKey)) {
      // with no words typed (or with Alt), the arrows change the kind
      e.preventDefault();
      moveTab(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Tab' && !e.shiftKey && !signedOut && !pageOnly) {
      e.preventDefault();
      ask();
    }
  };

  let index = -1;
  return (
    <div className="overlay sd-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sd" role="dialog" aria-label="Search" onKeyDown={onKeyDown}>
        <div className="sd-top">
          <input
            ref={inputRef}
            className="sd-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={pageSources.find((s) => s.tab === tab)?.placeholder ?? 'Search chats, papers, drafts and actions'}
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="sd-list"
          />
          {loading && <span className="sd-spin" aria-label="Searching" />}
          <button type="button" className="sd-x" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {tabs.length > 1 && (
          <div className="sd-tabs" role="tablist" aria-label="What to search">
            {tabs
              .filter((t) => !signedOut || !['chats', 'papers', 'drafts'].includes(t.id))
              .map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
          </div>
        )}

        <div className="sd-list" id="sd-list" role="listbox" ref={listRef}>
          {visible.map((s) => (
            <div key={s.label} className="sd-sec">
              <div className="sd-sec-h">{s.label}</div>
              {s.rows.map((r) => {
                index++;
                const i = index;
                return (
                  <button key={r.key} type="button" className="sd-row" role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => exec(r)}>
                    <Icon name={r.icon} />
                    <span className="sd-row-text">
                      <span className="sd-row-title">{r.title}</span>
                      {r.sub && <span className="sd-row-sub">{r.sub}</span>}
                    </span>
                    {r.flag && <span className="sd-flag">{r.flag}</span>}
                    {r.meta && <span className="sd-meta">{r.meta}</span>}
                    <span className="sd-enter" aria-hidden="true">
                      <Icon name="arrow" />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!rows.length && !loading && (
            <div className="sd-empty">
              {q.trim() ? <>Nothing matches “{q.trim()}”.</> : tab === 'all' ? 'Nothing here yet. Start a chat or save a paper.' : 'Nothing here yet.'}
              {q.trim() && !signedOut && !pageOnly && (
                <button type="button" className="sd-ask" onClick={ask}>
                  <Icon name="sparkle" /> Ask the assistant about “{q.trim()}”
                </button>
              )}
            </div>
          )}
        </div>

        <div className="sd-foot">
          <span>
            Close <kbd>Esc</kbd>
          </span>
          {tabs.length > 1 && (
            <span>
              Change type <kbd>←</kbd>
              <kbd>→</kbd>
            </span>
          )}
          <span>
            Open <kbd>↵</kbd>
          </span>
          {!signedOut && !pageOnly && (
            <span className="sd-foot-end">
              Ask the assistant <kbd>Tab</kbd>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
