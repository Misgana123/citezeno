'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountOverview } from '@/lib/account/overview';
import { connectorFetch } from '../connectors/api';

/* The account as Settings shows it, loaded when the dialog opens. */
export function useAccount() {
  const [data, setData] = useState<AccountOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await connectorFetch<AccountOverview>('/api/account'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, set: setData };
}

export type AccountState = ReturnType<typeof useAccount>;
