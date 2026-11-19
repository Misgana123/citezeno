'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, LogoMark, type IconName } from '../Icon';
import { ThemeToggle } from '../Nav';
import { UserMenu } from '../UserMenu';
import { useCredits } from '../useCredits';
import { useShelfNotices } from '../shelf/useShelfNotices';

/* The workspace frame shared by the studio and the signed-in pages around it
   (library, history, account, admin): a navigation rail and a top bar, with the
   page scrolling between them. Styles live in app/atelier.css. */

export type AppSection = 'chat' | 'library' | 'history' | 'papers' | 'shelf' | 'account' | 'admin' | null;

/* One destination in the rail. `short` is its caption when the rail is the phone's bottom bar. */
export function RailLink({ href, icon, label, short, current, cls, badge }: { href: string; icon: IconName; label: string; short?: string; current?: boolean; cls?: string; badge?: number }) {
  return (
    <Link className={`at-rb${cls ? ' ' + cls : ''}`} href={href} aria-label={badge ? `${label} (${badge} new)` : label} aria-current={current ? 'page' : undefined}>
      <Icon name={icon} />
      {badge ? <span className="at-rb-badge">{badge > 99 ? '99+' : badge}</span> : null}
      <span className="at-rb-lbl" data-short={short}>
        {label}
      </span>
    </Link>
  );
}

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

export const openPalette = () => window.dispatchEvent(new Event('citezeno:palette'));

export function AppShell({ current, title, children }: { current: AppSection; title: string; children: ReactNode }) {
  const shelfNotices = useShelfNotices();
  return (
    <div className="at-frame">
      <div className="at at-page">
        <nav className="at-rail" aria-label="Workspace">
          <Link className="at-logo" href="/" aria-label="Citezeno home">
            <LogoMark className="at-logo-mark" />
          </Link>
          <div className="at-rail-main">
            <RailLink href="/chat" icon="sparkle" label="Assistant" short="Chat" current={current === 'chat'} />
            <RailLink href="/studio" icon="doc" label="Studio" />
            <RailLink href="/library" icon="history" label="Library" current={current === 'library'} />
            <RailLink href="/history" icon="clock" label="History" current={current === 'history'} />
            <RailLink href="/papers" icon="book" label="Find papers" short="Papers" current={current === 'papers'} />
            <RailLink href="/shelf" icon="layers" label="My shelf" short="Shelf" current={current === 'shelf'} badge={shelfNotices} />
            <button className="at-rb at-only-phone" onClick={openPalette} aria-label="Commands">
              <Icon name="search" />
              <span className="at-rb-lbl" data-short="Search">
                Commands
              </span>
            </button>
            {current === 'admin' && <RailLink href="/admin" icon="chart" label="Admin" current cls="at-hide-phone" />}
          </div>
          <div className="at-rail-end">
            <RailLink href="/#method" icon="help" label="How it works" cls="at-hide-phone" />
            <RailLink href="/account" icon="user" label="Account" current={current === 'account'} />
          </div>
        </nav>

        <header className="at-top">
          <Link className="at-top-logo" href="/" aria-label="Citezeno home">
            <LogoMark className="at-logo-mark" />
          </Link>
          <div className="at-doc">
            <Link className="at-crumb" href="/studio">
              Studio
            </Link>
            <span className="at-crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="at-here">{title}</span>
          </div>
          <button className="at-cmdk" onClick={openPalette} aria-label="Open the command menu">
            <Icon name="search" />
            <span>Search commands</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <CreditsPill />
          <Link className="at-run at-run-link" href="/studio">
            <Icon name="doc" /> <span className="at-run-lbl">Open the studio</span>
          </Link>
          <span className="at-top-sep" aria-hidden="true" />
          <ThemeToggle />
          <UserMenu />
        </header>

        <main className="at-main">
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
