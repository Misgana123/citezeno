'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, LogoMark, type IconName } from '../Icon';
import { ThemeToggle } from '../Nav';
import { UserMenu } from '../UserMenu';
import { useCredits } from '../useCredits';
import { useShelfNotices } from '../shelf/useShelfNotices';
import { APP_SECTIONS, type AppSection } from './sections';

/* The workspace frame shared by every signed-in page: a navigation rail, a
   slim top bar (the page's title and actions), and the page between them,
   either a scrolling page or, for the assistant, one full-height panel.
   Styles live in app/atelier.css. */

export type { AppSection };

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

export function AppShell({
  current,
  title,
  actions,
  variant = 'page',
  children,
}: {
  current: AppSection;
  title: ReactNode;
  /* buttons at the right of the top bar, before the account controls */
  actions?: ReactNode;
  /* page: one scrolling column with a footer; panel: one full-height panel (the assistant) */
  variant?: 'page' | 'panel';
  children: ReactNode;
}) {
  const shelfNotices = useShelfNotices();
  return (
    <div className="at-frame">
      <div className="at at-page">
        <nav className="at-rail" aria-label="Workspace">
          <Link className="at-logo" href="/" aria-label="Citezeno home">
            <LogoMark className="at-logo-mark" />
          </Link>
          <div className="at-rail-main">
            {APP_SECTIONS.map((s) => (
              <RailLink key={s.id} href={s.href} icon={s.icon} label={s.label} short={s.short} current={current === s.id} badge={s.id === 'shelf' ? shelfNotices : undefined} cls={s.id === 'library' || s.id === 'history' ? 'at-hide-phone' : undefined} />
            ))}
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
            <RailLink href="/app/account" icon="user" label="Account" current={current === 'account'} />
          </div>
        </nav>

        <header className="at-top">
          <Link className="at-top-logo" href="/" aria-label="Citezeno home">
            <LogoMark className="at-logo-mark" />
          </Link>
          <div className="at-doc">
            <span className="at-here">{title}</span>
          </div>
          {actions && <div className="at-top-actions">{actions}</div>}
          <button className="at-cmdk" onClick={openPalette} aria-label="Open the command menu">
            <Icon name="search" />
            <span>Search commands</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <CreditsPill />
          <span className="at-top-sep" aria-hidden="true" />
          <ThemeToggle />
          <UserMenu />
        </header>

        {variant === 'panel' ? (
          <main className="at-main is-panel">
            <div className="at-panel">{children}</div>
          </main>
        ) : (
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
        )}
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
