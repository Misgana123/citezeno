'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SETTINGS_EVENT, targetFromParams, type SettingsTarget } from './open';
import { SettingsDialog } from './SettingsDialog';

/* Mounted once in the app shell: opens Settings when asked (openSettings(),
   Ctrl+, or a link with ?settings=…). */

function Host() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [target, setTarget] = useState<SettingsTarget | null>(null);

  // a link asked for Settings
  useEffect(() => {
    const asked = targetFromParams(params);
    if (!asked) return;
    setTarget(asked);
    const next = new URLSearchParams(params);
    for (const k of ['settings', 'view']) next.delete(k);
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

  return target ? <SettingsDialog target={target} onClose={() => setTarget(null)} /> : null;
}

export function SettingsHost() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  );
}
