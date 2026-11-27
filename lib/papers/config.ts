/* Find Papers settings, from server environment variables so they can change
   without a code change. Nothing here is sent to the browser. The paper
   provider's own settings (key, cache, spending caps) live with its adapter in
   lib/providers/<name>/config.ts.

     PAPERS_DAILY_SEARCHES       searches per user per day (default 100) */

import { primaryPaperLimits } from '@/lib/providers/papers/limits';

type Env = Record<string, string | undefined>;

export type PapersConfig = {
  /* The longest search text the primary paper provider accepts. */
  maxQueryChars: number;
  dailySearchesPerUser: number;
};

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function papersConfig(env: Env = process.env): PapersConfig {
  return {
    maxQueryChars: primaryPaperLimits(env).maxQueryChars,
    dailySearchesPerUser: Math.floor(positive(env.PAPERS_DAILY_SEARCHES, 100)),
  };
}
