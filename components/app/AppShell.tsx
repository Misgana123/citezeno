'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { useCredits } from '../useCredits';
import { RAIL_EVENT } from '../chat/file/panel-state';
import { type AppSection } from './sections';
import { openPalette, Sidebar } from './Sidebar';

/* The workspace frame shared by every signed-in page: the sidebar (New chat,
   Search, the tools, the user's chats and account) and the page beside it,
   either a scrolling page or, for the assistant, the whole window. On phones
   the sidebar is a drawer opened from a slim top bar. Styles: app/atelier.css. */

export type { AppSection };

/* The credit balance, with a small meter of the current plan credits left. `need` marks it low. */
export function CreditsPill({ need = 5 }: { need?: number }) {
  const credits = useCredits(true);
  if (!credits) return null;
  const low = credits.total < Math.max(need, 5);
  const plan = credits.lots.find((l) => l.source === 'plan');
  const title = credits.lots.map((l) => `${(l.remaining - l.held).toLocaleString()} ${l.label.toLowerCase()}${l.expiresAt ? ` · until ${new Date(l.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`).join('\n') + (credits.held ? `\n${credits.held} on hold` : '');
  return (
    <Link href="/pricing" className={`at-credits${low ? ' low' : ''}`} title={title || 'No credits'}>
      <Icon name="bolt" />
      <b>{credits.total.toLocaleString()}</b>
      <span className="at-credits-lbl">credit{credits.total === 1 ? '' : 's'}</span>
      <span className="at-credits-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, plan ? ((plan.remaining - plan.held) / plan.amount) * 100 : 0)}%` }} />
      </span>
    </Link>
  );
}

export { openPalette };

/* Whether the sidebar is folded to icons, remembered in this browser. A page
   that needs the room (the reader) starts it folded without changing what is
   remembered, so it opens out again on the next page. */
function useCompactSidebar(rail = false): [boolean, (v: boolean) => void] {
  const [compact, setCompact] = useState(rail);
  useEffect(() => {
    if (rail) return;
    try {
      setCompact(localStorage.getItem('cz:sidebar') === 'compact');
    } catch {
      /* storage blocked */
    }
  }, [rail]);
  const set = (v: boolean) => {
    setCompact(v);
    if (rail) return;
    try {
      localStorage.setItem('cz:sidebar', v ? 'compact' : 'full');
    } catch {
      /* storage blocked */
    }
  };
  return [compact, set];
}

/* The sidebar's width, dragged by its edge and remembered in this browser (null: the usual width). */
const SIDE_MIN = 220;
const SIDE_MAX = 420;
const SIDE_KEY = 'cz:sidebar-width';
const clampSide = (w: number) => Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)));

function useSidebarWidth(): [number | null, (w: number | null) => void] {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDE_KEY));
      if (saved) setWidth(clampSide(saved));
    } catch {
      /* storage blocked */
    }
  }, []);
  const set = (w: number | null) => {
    setWidth(w);
    try {
      if (w == null) localStorage.removeItem(SIDE_KEY);
      else localStorage.setItem(SIDE_KEY, String(w));
    } catch {
      /* storage blocked */
    }
  };
  return [width, set];
}

/* The handle on the sidebar's edge: drag it, or focus it and use the arrow keys; double-click resets. */
function SidebarResizer({ width, onWidth, onDragging }: { width: number | null; onWidth(w: number | null): void; onDragging(on: boolean): void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const current = () => width ?? (document.querySelector('.cz-side') as HTMLElement | null)?.offsetWidth ?? 264;
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: current() };
    onDragging(true);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) onWidth(clampSide(start.current.w + e.clientX - start.current.x));
  };
  const up = () => {
    start.current = null;
    onDragging(false);
  };
  return (
    <div
      className="cz-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuemin={SIDE_MIN}
      aria-valuemax={SIDE_MAX}
      aria-valuenow={Math.round(width ?? 264)}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => onWidth(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          onWidth(clampSide(current() + (e.key === 'ArrowRight' ? 16 : -16)));
        }
      }}
    />
  );
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches;

export function AppShell({
  current,
  title,
  actions,
  variant = 'page',
  rail = false,
  children,
}: {
  current: AppSection;
  title: ReactNode;
  /* buttons for the page's top bar (shown on phones, and beside the title on pages that have one) */
  actions?: ReactNode;
  /* page: one scrolling column with a footer; panel: the page fills the window (the assistant) */
  variant?: 'page' | 'panel';
  /* start with the sidebar folded to its icons (not remembered) */
  rail?: boolean;
  children: ReactNode;
}) {
  const [compact, setCompact] = useCompactSidebar(rail);
  // folded for now by the page (a file open beside the assistant), not remembered
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setFolded(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(RAIL_EVENT, on);
    return () => window.removeEventListener(RAIL_EVENT, on);
  }, []);
  const small = compact || folded;
  const [sideWidth, setSideWidth] = useSidebarWidth();
  const [resizing, setResizing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

  return (
    <div className="at-frame">
      <div
        className={`cz-app at-page${small ? ' is-compact' : ''}${drawer ? ' is-drawer' : ''}${resizing ? ' is-resizing' : ''}`}
        style={!small && sideWidth ? ({ '--cz-side': `${sideWidth}px` } as CSSProperties) : undefined}
      >
        <Sidebar current={current} compact={small && !drawer} onToggle={() => (isPhone() ? setDrawer(false) : folded ? setFolded(false) : setCompact(!compact))} onNavigate={() => setDrawer(false)} />
        {!small && <SidebarResizer width={sideWidth} onWidth={setSideWidth} onDragging={setResizing} />}
        {drawer && <button type="button" className="cz-scrim" aria-label="Close the menu" onClick={() => setDrawer(false)} />}

        <div className="cz-main">
          <header className="cz-bar">
            <button type="button" className="cz-ib" onClick={() => setDrawer(true)} aria-label="Open the menu" aria-expanded={drawer}>
              <Icon name="menu" />
            </button>
            <span className="cz-bar-title">{title}</span>
            {actions && <div className="cz-bar-acts">{actions}</div>}
          </header>

          {variant === 'panel' ? (
            <main className="cz-panel">{children}</main>
          ) : (
            <main className="cz-page">
              <div className="at-page-in">
                {children}
                <footer className="at-page-foot">
                  <span>© {new Date().getFullYear()} Citezeno</span>
                  <Link href="/pricing">Pricing</Link>
                  <Link href="/contact">Contact</Link>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/terms">Terms</Link>
                </footer>
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}

/* The heading block at the top of a workspace page. */
export function PageHead({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="at-page-head">
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="at-page-actions">{actions}</div>}
    </header>
  );
}
