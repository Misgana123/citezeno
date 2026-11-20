'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { useCredits } from '../useCredits';
import { type AppSection } from './sections';
import { openPalette, Sidebar } from './Sidebar';

/* The workspace frame shared by every signed-in page: the sidebar (New chat,
   Search, the tools, the user's chats and account) and the page beside it,
   either a scrolling page or, for the assistant, the whole window. On phones
   the sidebar is a drawer opened from a slim top bar. Styles: app/atelier.css. */

export type { AppSection };

/* The credit balance, with a small meter of this month's free credits. `need` marks it low. */
export function CreditsPill({ need = 5 }: { need?: number }) {
  const credits = useCredits(true);
  if (!credits) return null;
  const low = credits.total < Math.max(need, 5);
  return (
    <Link href="/pricing" className={`at-credits${low ? ' low' : ''}`} title={`${credits.free} free (resets monthly) + ${credits.paid} purchased`}>
      <Icon name="bolt" />
      <b>{credits.total.toLocaleString()}</b>
      <span className="at-credits-lbl">credit{credits.total === 1 ? '' : 's'}</span>
      <span className="at-credits-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, credits.freeMonthly ? (credits.free / credits.freeMonthly) * 100 : 0)}%` }} />
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
      <div className={`cz-app at-page${compact ? ' is-compact' : ''}${drawer ? ' is-drawer' : ''}`}>
        <Sidebar current={current} compact={compact && !drawer} onToggle={() => (isPhone() ? setDrawer(false) : setCompact(!compact))} onNavigate={() => setDrawer(false)} />
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
