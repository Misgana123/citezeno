import type Redis from 'ioredis';
import type { CacheStore, SlotStore } from './types';

/* Redis gateway stores: the same jobs as the Postgres ones (pg.ts), faster and
   without load on the app's database. Shared by every server instance that
   uses the same Redis. Keys start with `prefix` so they never meet other data. */

export const REDIS_PREFIX = 'cz:';

export function redisCache(client: Redis, prefix = REDIS_PREFIX): CacheStore {
  return {
    async get(key) {
      const raw = await client.get(`${prefix}cache:${key}`);
      return raw == null ? null : JSON.parse(raw);
    },
    async set(key, value, ttlS) {
      await client.set(`${prefix}cache:${key}`, JSON.stringify(value), 'EX', Math.max(1, Math.floor(ttlS)));
    },
  };
}

/* Reserve the next free slot in one step (a Lua script runs atomically), the
   same rule as pgSlots: a slot at most maxWait away, else -1 ("too long"). The
   key expires a minute after its last slot, so idle keys clean themselves up. */
const RESERVE = `
local nextAt = tonumber(redis.call('GET', KEYS[1]) or '0')
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local maxWait = tonumber(ARGV[3])
local slot = math.max(nextAt, now)
if slot - now > maxWait then return -1 end
redis.call('SET', KEYS[1], slot + interval, 'PX', slot + interval - now + 60000)
return slot - now
`;

export function redisSlots(client: Redis, prefix = REDIS_PREFIX): SlotStore {
  return {
    async reserve(key, intervalMs, maxWaitMs, now) {
      const wait = Number(await client.eval(RESERVE, 1, `${prefix}slot:${key}`, Math.floor(now), Math.ceil(intervalMs), Math.floor(maxWaitMs)));
      return wait < 0 ? null : wait;
    },
  };
}
