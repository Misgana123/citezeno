import 'server-only';
import { pool } from '@/lib/db';
import { newMeter, type Meter } from '@/lib/providers/gateway/meter';
import { connectorFor } from '@/lib/providers/server';
import type { ConnectorDeps } from './access';
import { connectorKeys } from './crypto';

/* The app's connectors: its database, its key, and adapters wired through the
   gateway (with this request's meter). */
export function connectorDeps(meter: Meter = newMeter()): ConnectorDeps {
  return { db: pool, keys: connectorKeys(), build: (name) => connectorFor(name, meter) };
}
