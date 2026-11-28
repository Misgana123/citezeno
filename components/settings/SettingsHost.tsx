'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from '../toast';
import { reloadConnectors } from '../connectors/useConnectors';
import { SETTINGS_EVENT, targetFromParams, type SettingsTarget } from './open';
import { SettingsDialog } from './SettingsDialog';

/* Mounted once in the app shell: opens Settings when asked (openSettings(),
   Ctrl+, or a link with ?settings=…), and says how connecting an app went when
   its sign-in page sends the user back here. */

function Host() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [target, setTarget] = useState<SettingsTarget | null>(null);

  // a link asked for Settings, or an app's sign-in page sent the user back
  useEffect(() => {
    const asked = targetFromParams(params);
    const ok = params.get('connected');
    const err = params.get('connect_error');
    if (!asked && !ok && !err) return;
    if (ok || err) {
      toast(ok ? 'App connected' : err!, !ok);
      void reloadConnectors();
    }
    if (asked) setTarget(asked);
    const next = new URLSearchParams(params);
    for (const k of ['settings', 'tab', 'view', 'connected', 'connect_error']) next.delete(k);
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
