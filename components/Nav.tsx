'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, LogoMark } from './Icon';
import { UserMenu } from './UserMenu';

const LINKS = [
  { href: '/studio', label: 'Studio' },
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

export function Nav({ onBlue = false, wide = false }: { onBlue?: boolean; wide?: boolean }) {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const openPalette = () => window.dispatchEvent(new Event('citezeno:palette'));

  return (
    <header className={`nav${onBlue ? ' on-blue' : ''}${scrolled || !onBlue ? ' scrolled' : ''}`}>
      <div className={`wrap nav-in${wide ? ' ws-wide' : ''}`}>
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
          <button className="cmdk-hint" onClick={openPalette} aria-label="Open command menu">
            <Icon name="search" width={15} height={15} />
            <span className="lbl">Commands</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <ThemeToggle />
          <UserMenu />
          {path !== '/studio' && (
            <Link className="btn btn-thread btn-sm" href="/studio">
              Open the studio
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <Link className="brand" href="/">
          <LogoMark />
          Citezeno
        </Link>
        <p style={{ margin: 0, maxWidth: '52em' }}>
          Records come from <a href="https://openalex.org" target="_blank" rel="noopener noreferrer">OpenAlex</a>,{' '}
          <a href="https://www.crossref.org" target="_blank" rel="noopener noreferrer">Crossref</a>,{' '}
          <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library</a> and{' '}
          <a href="https://www.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>. Open every source and
          check it before you rely on it.
        </p>
        <nav className="foot-links" aria-label="Footer">
          <Link href="/studio">Studio</Link>
          <Link href="/styles">Citation styles</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <span>© {new Date().getFullYear()} Citezeno</span>
        </nav>
      </div>
    </footer>
  );
}
