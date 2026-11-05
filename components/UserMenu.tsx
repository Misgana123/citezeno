'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from '@/lib/auth-client';
import { Icon } from './Icon';
import { toast } from './toast';

export const initials = (name?: string | null, email?: string | null) =>
  ((name || email || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();

export function UserMenu() {
  const { data, isPending } = useSession();
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
  if (!data) {
    const next = path && !path.startsWith('/sign-') ? `?next=${encodeURIComponent(path)}` : '';
    return (
      <Link className="nav-signin" href={`/sign-in${next}`}>
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
          </div>
          <Link href="/account" role="menuitem">
            <Icon name="user" /> Account
          </Link>
          <Link href="/studio" role="menuitem">
            <Icon name="doc" /> Studio
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
