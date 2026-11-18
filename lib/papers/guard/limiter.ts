import { PapersError } from '../errors';
import type { QueryParams } from '../openalex/client';
import type { Layer } from './call';

/* The in-process queue in front of OpenAlex: at most `concurrency` calls at
   once, at most `maxQueue` waiting. A full queue answers "busy" straight away
   instead of piling up requests. */

export type Limiter = { run<T>(task: () => Promise<T>): Promise<T>; readonly active: number; readonly waiting: number };

export function createLimiter({ concurrency, maxQueue }: { concurrency: number; maxQueue: number }): Limiter {
  let active = 0;
  const queue: (() => void)[] = [];

  const release = () => {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  };

  return {
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    async run<T>(task: () => Promise<T>) {
      if (active >= concurrency) {
        if (queue.length >= maxQueue) throw new PapersError('busy', 'The OpenAlex queue is full.', { reason: 'queue_full' });
        await new Promise<void>((resolve) => queue.push(resolve));
      } else {
        active++;
      }
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

export const withLimiter =
  (limiter: Limiter): Layer =>
  (inner) => ({
    get<T>(path: string, params: QueryParams = {}) {
      return limiter.run(() => inner.get<T>(path, params));
    },
  });
