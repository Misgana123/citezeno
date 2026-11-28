'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SETTINGS_EVENT, targetFromParams, type SettingsTarget } from './open';
import { SettingsDialog } from './SettingsDialog';
import { JoinLab } from '../labs/JoinLab';

/* Mounted once in the app shell: opens Settings when asked (openSettings(),
   Ctrl+, or a link with ?settings=…), and the Join dialog for a lab invitation
   link (?lab-invite=…). */

function Host() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [target, setTarget] = useState<SettingsTarget | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  // a link asked for Settings, or is a lab invitation
  useEffect(() => {
    const asked = targetFromParams(params);
    const token = params.get('lab-invite');
    if (!asked && !token) return;
    if (asked) setTarget(asked);
    if (token) setInvite(token);
    const next = new URLSearchParams(params);
    for (const k of ['settings', 'view', 'lab-invite']) next.delete(k);
    const q = next.toString();
    router.replace(`${path}${q ? `?${q}` : ''}${window.location.hash}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const on = (e: Event) => setTarget((e as CustomEvent<SettingsTarget>).detail);
    const key = (e: KeyboardEvent) => {
      if (e.key === ',' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        setTarget((t) => t ?? { section: 'account' });
      }
    };
    window.addEventListener(SETTINGS_EVENT, on);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, on);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <>
      {target && <SettingsDialog target={target} onClose={() => setTarget(null)} />}
      {invite && <JoinLab token={invite} onClose={() => setInvite(null)} />}
    </>
  );
}

export function SettingsHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
