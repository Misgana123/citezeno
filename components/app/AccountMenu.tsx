'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import { Icon } from '../Icon';
import { toast } from '../toast';
import { useCredits } from '../useCredits';
import { initials } from '../UserMenu';

/* The account at the bottom of the sidebar: who is signed in and their
   credits; it opens a menu (upwards) with account settings, credits, the
   theme, help and signing out. `compact`: the avatar alone. */

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cz:theme', next);
    } catch {
      /* storage blocked */
    }
    setDark(!dark);
  };
  return [dark, flip];
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { data } = useSession();
  const credits = useCredits(Boolean(data));
  const [open, setOpen] = useState(false);
  const [dark, flipTheme] = useTheme();
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  if (!data) return <span className="cz-acct-skel" aria-hidden="true" />;
  const u = data.user;
  const out = async () => {
    await signOut();
    toast('Signed out');
    router.push('/');
    router.refresh();
  };
  const avatar = <span className="cz-av">{u.image ? <img src={u.image} alt="" referrerPolicy="no-referrer" /> : initials(u.name, u.email)}</span>;

  return (
    <div className={`cz-acct${compact ? ' is-compact' : ''}`} ref={box}>
      <button type="button" className="cz-acct-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Your account">
        {avatar}
        {!compact && (
          <>
            <span className="cz-acct-who">
              <b>{u.name || u.email}</b>
              <small>{credits ? `${credits.total.toLocaleString()} credit${credits.total === 1 ? '' : 's'}` : 'Your account'}</small>
            </span>
            <Icon name="chevron" className="cz-acct-chev" />
          </>
        )}
      </button>
      {open && (
        <div className="cz-acct-pop" role="menu">
          <div className="cz-acct-head">
            <span className="cz-acct-email">{u.email}</span>
            {credits && (
              <span className="cz-acct-credits">
                <span>
                  <Icon name="bolt" /> <b>{credits.total.toLocaleString()}</b> credits
                </span>
                <Link href="/pricing" className="cz-acct-top">
                  Top up
                </Link>
              </span>
            )}
          </div>
          <Link href="/app/account" role="menuitem">
            <Icon name="user" /> Account settings
          </Link>
          <Link href="/pricing" role="menuitem">
            <Icon name="bolt" /> Pricing and credits
          </Link>
          <button type="button" role="menuitem" onClick={flipTheme}>
            <Icon name={dark ? 'sun' : 'moon'} /> {dark ? 'Light theme' : 'Dark theme'}
          </button>
          <Link href="/#method" role="menuitem">
            <Icon name="help" /> How it works
          </Link>
          <Link href="/contact" role="menuitem">
            <Icon name="mail" /> Contact us
          </Link>
          <span className="cz-acct-sep" />
          <button type="button" role="menuitem" onClick={out}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
