import Redis from 'ioredis';

/* One Redis client per server instance, when REDIS_URL is set (optional: any
   Redis, e.g. Upstash's "rediss://" URL). Without it the app keeps everything
   in Postgres. Parked on globalThis like the Postgres pool, so dev reloads
   reuse it. Commands give up fast (COMMAND_TIMEOUT_MS) so a Redis outage
   costs a request little time: callers fall back to Postgres. */

export const COMMAND_TIMEOUT_MS = 500;

const g = globalThis as unknown as { __czRedis?: { url: string; client: Redis } };

export function createRedis(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    commandTimeout: COMMAND_TIMEOUT_MS,
    connectTimeout: 3000,
    // keep trying to reconnect, a little slower each time (at most every 5 s)
    retryStrategy: (times) => Math.min(5000, 200 * times),
  });
  // without a listener, ioredis logs every failed reconnect as an unhandled error
  client.on('error', (e) => console.warn('[citezeno] redis:', (e as Error).message));
  return client;
}

/* The shared client, or null when REDIS_URL isn't set. */
export function redis(env: Record<string, string | undefined> = process.env): Redis | null {
  const url = env.REDIS_URL?.trim();
  if (!url) return null;
  if (g.__czRedis?.url !== url) {
    g.__czRedis?.client.disconnect();
    g.__czRedis = { url, client: createRedis(url) };
  }
  return g.__czRedis.client;
}
