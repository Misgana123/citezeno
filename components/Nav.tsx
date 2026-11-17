'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, LogoMark } from './Icon';
import { UserMenu } from './UserMenu';

const LINKS = [
  { href: '/styles', label: 'Citation styles' },
  { href: '/#method', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cz:theme', next);
    } catch {
      /* ignore */
    }
    setDark(!dark);
  };
  return (
    <button className="icon-btn" onClick={flip} aria-label={dark ? 'Use light theme' : 'Use dark theme'} title="Toggle theme">
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export function Nav({ onBlue = false }: { onBlue?: boolean }) {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  // the phone menu closes on navigation and on Escape
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  /* a frosted pill: glass over the dark hero, solid once the page scrolls under it */
  const dark = onBlue && !scrolled;
  return (
    <header className={`nav${onBlue ? ' on-blue' : ''}${dark ? ' is-glass' : ''}${scrolled ? ' scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="nav-pill">
        <Link className="brand" href="/" aria-label="Citezeno home">
          <LogoMark />
          Citezeno
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-end">
          <span className="nav-theme">
            <ThemeToggle />
          </span>
          <UserMenu />
          {path !== '/studio' && (
            <Link className="btn btn-thread nav-cta" href="/studio">
              <span className="nav-cta-long">Open the studio</span>
              <span className="nav-cta-short">Studio</span>
              <Icon name="arrow" />
            </Link>
          )}
          <button className="icon-btn nav-burger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="nav-sheet" aria-label={open ? 'Close the menu' : 'Open the menu'}>
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      <div className="nav-sheet" id="nav-sheet" hidden={!open}>
        <nav aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined} onClick={() => setOpen(false)}>
              {l.label}
              <Icon name="chevron" />
            </Link>
          ))}
        </nav>
        <div className="nav-sheet-end">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

const FOOT_COLS: [string, [string, string][]][] = [
  ['Product', [['/studio', 'Studio'], ['/#method', 'How it works'], ['/pricing', 'Pricing']]],
  ['Generators', [['/styles/apa', 'APA'], ['/styles/mla', 'MLA'], ['/styles/chicago', 'Chicago'], ['/styles/harvard', 'Harvard'], ['/styles/ieee', 'IEEE'], ['/styles/vancouver', 'Vancouver'], ['/styles', 'All styles']]],
  ['Company', [['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms']]],
];

/* "Signature": a short promise, three link columns, the data credit and a
   large serif wordmark fading off the bottom edge. */
export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <p className="foot-lead">
            Every claim needs a source <em>that exists.</em>
          </p>
          {FOOT_COLS.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h2>{title}</h2>
              <ul>
                {links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="foot-mid">
          <p>
            Records from <a href="https://openalex.org" target="_blank" rel="noopener noreferrer">OpenAlex</a>,{' '}
            <a href="https://www.crossref.org" target="_blank" rel="noopener noreferrer">Crossref</a>,{' '}
            <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library</a> and{' '}
            <a href="https://www.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>. Check every source
            before you rely on it.
          </p>
          <span>© {new Date().getFullYear()} Citezeno</span>
        </div>
      </div>
      <div className="foot-word" aria-hidden="true">
        Citezeno<span>.</span>
      </div>
    </footer>
  );
}
