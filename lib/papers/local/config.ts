/* Settings for our own copy of papers, from server environment variables:

     PAPERS_LOCAL_COPY           keep a copy of every paper users see, and answer single
                                 papers from it (default off; "1" to turn on)
     PAPERS_LOCAL_FRESH_DAYS     how old a kept paper may be and still be served (default 7)
     PAPERS_LOCAL_FIRST          search the copy first; answer from it when it has enough
                                 matches (default off; needs PAPERS_LOCAL_COPY)
     PAPERS_LOCAL_MIN_RESULTS    "enough": matches the copy needs to answer a search (default 50) */

type Env = Record<string, string | undefined>;

export type LocalCopyConfig = { enabled: boolean; freshDays: number; searchFirst: boolean; minResults: number };

const on = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? '');

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function localCopyConfig(env: Env = process.env): LocalCopyConfig {
  const enabled = on(env.PAPERS_LOCAL_COPY);
  return {
    enabled,
    freshDays: positive(env.PAPERS_LOCAL_FRESH_DAYS, 7),
    searchFirst: enabled && on(env.PAPERS_LOCAL_FIRST),
    minResults: Math.floor(positive(env.PAPERS_LOCAL_MIN_RESULTS, 50)),
  };
}
