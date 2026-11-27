'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Capability } from '@/lib/providers/connectors/types';
import { listConnectors } from './api';

/* The apps a page can offer, and which are connected (loaded once). */
export function useConnectors() {
  const [connectors, setConnectors] = useState<ConnectorView[] | null>(null);
  const reload = useCallback(() => {
    listConnectors()
      .then(setConnectors)
      .catch(() => setConnectors([]));
  }, []);
  useEffect(reload, [reload]);
  const find = (name: string) => connectors?.find((c) => c.name === name) ?? null;
  const connected = (name: string) => find(name)?.connection?.status === 'ok';
  /* the first app that can do this (connected ones first) */
  const forCapability = (cap: Capability) => {
    const able = connectors?.filter((c) => c.capabilities.includes(cap)) ?? [];
    return able.find((c) => c.connection?.status === 'ok') ?? able[0] ?? null;
  };
  return { connectors, find, connected, forCapability, reload };
}
