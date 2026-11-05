'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import { Icon } from './Icon';
import { toast } from './toast';
import { useCredits } from './useCredits';

export const initials = (name?: string | null, email?: string | null) =>
  ((name || email || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();

export function UserMenu() {
  const { data, isPending } = useSession();
  const credits = useCredits(Boolean(data));
  const [open, setOpen] = useState(false);
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

  if (isPending) return <span className="umenu-skel" aria-hidden="true" />;
  // signing in always lands in the studio
  if (!data) {
    return (
      <Link className="nav-signin" href="/sign-in">
        Sign in
      </Link>
    );
  }

  const u = data.user;
  const out = async () => {
    await signOut();
    toast('Signed out');
    router.push('/');
    router.refresh();
  };

  return (
    <div className="umenu" ref={box}>
      <button className="umenu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Your account">
        {u.image ? <img src={u.image} alt="" referrerPolicy="no-referrer" /> : initials(u.name, u.email)}
      </button>
      {open && (
        <div className="umenu-pop" role="menu">
          <div className="umenu-who">
            <b>{u.name || 'Your account'}</b>
            <span>{u.email}</span>
            {credits && (
              <span className="umenu-credits">
                <span>
                  <b>{credits.total.toLocaleString()}</b> credits
                </span>
                <Link href="/pricing" className="umenu-top">
                  Top up
                </Link>
              </span>
            )}
          </div>
          <Link href="/account" role="menuitem">
            <Icon name="user" /> Account
          </Link>
          <Link href="/pricing" role="menuitem">
            <Icon name="bolt" /> Pricing and credits
          </Link>
          <Link href="/studio" role="menuitem">
            <Icon name="doc" /> Studio
          </Link>
          <Link href="/library" role="menuitem">
            <Icon name="list" /> Library
          </Link>
          <Link href="/history" role="menuitem">
            <Icon name="history" /> History
          </Link>
          <Link href="/contact" role="menuitem">
            <Icon name="mail" /> Contact us
          </Link>
          <button onClick={out} role="menuitem">
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
