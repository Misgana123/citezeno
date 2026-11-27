import { ProviderError } from '../errors';
import type { Layer } from './types';

/* The in-process queue in front of one provider: at most `concurrency` calls at
   once, at most `maxQueue` waiting. A full queue answers "busy" straight away
   instead of piling up requests. */

export type Limiter = { run<T>(task: () => Promise<T>): Promise<T>; readonly active: number; readonly waiting: number };

export function createLimiter({ concurrency, maxQueue, label = 'provider' }: { concurrency: number; maxQueue: number; label?: string }): Limiter {
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
        if (queue.length >= maxQueue) throw new ProviderError('busy', `The ${label} queue is full.`, { reason: 'queue_full' });
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
  <Req>(limiter: Limiter): Layer<Req> =>
  (inner) => ({
    call<T>(req: Req) {
      return limiter.run(() => inner.call<T>(req));
    },
  });
