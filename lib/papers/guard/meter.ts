import type { QueryParams } from '../openalex/client';
import { callKind, isSearch, type Layer } from './call';

/* Counts, for one user request, the searches and cost that actually reached
   OpenAlex (cache hits are free and not counted). Used to settle the user's
   daily search limit after the request. */

export type Meter = { searches: number; costUsd: number; calls: number };

export const newMeter = (): Meter => ({ searches: 0, costUsd: 0, calls: 0 });

export const withMeter =
  (meter: Meter): Layer =>
  (inner) => ({
    async get<T>(path: string, params: QueryParams = {}) {
      const res = await inner.get<T>(path, params);
      meter.calls++;
      meter.costUsd += res.costUsd;
      if (isSearch(callKind(path, params))) meter.searches++;
      return res;
    },
  });
