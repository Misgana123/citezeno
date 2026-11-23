import 'server-only';
import { redis } from '@/lib/redis';
import { cacheWithFallback, slotsWithFallback, storeHealth } from './fallback';
import { pgCache, pgSlots, pgSpend } from './pg';
import { redisCache, redisSlots } from './redis';
import type { CacheStore, SlotStore, SpendStore } from './types';

/* The stores the gateway uses on the server. With REDIS_URL set, the cache and
   the shared call slots live in Redis (Postgres takes over while Redis is
   down); without it, in Postgres. Spending always stays in Postgres: it is
   money, and only one small write per paid call. */

export type GatewayStores = { cache: CacheStore; slots: SlotStore; spend: SpendStore };

const g = globalThis as unknown as { __czGatewayStores?: { key: string; stores: GatewayStores } };

export function gatewayStores(): GatewayStores {
  const client = redis();
  const key = client ? 'redis' : 'pg';
  if (g.__czGatewayStores?.key === key) return g.__czGatewayStores.stores;
  let stores: GatewayStores = { cache: pgCache, slots: pgSlots, spend: pgSpend };
  if (client) {
    const health = storeHealth('redis');
    stores = { cache: cacheWithFallback(redisCache(client), pgCache, health), slots: slotsWithFallback(redisSlots(client), pgSlots, health), spend: pgSpend };
  }
  g.__czGatewayStores = { key, stores };
  return stores;
}
