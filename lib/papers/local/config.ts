/* Settings for our own copy of papers, from server environment variables:

     PAPERS_LOCAL_COPY           keep a copy of every paper users see, and answer single
                                 papers from it (default off; "1" to turn on)
     PAPERS_LOCAL_FRESH_DAYS     how old a kept paper may be and still be served (default 7) */

type Env = Record<string, string | undefined>;

export type LocalCopyConfig = { enabled: boolean; freshDays: number };

const on = (v: string | undefined) => /^(1|true|yes|on)$/i.test(v?.trim() ?? '');

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function localCopyConfig(env: Env = process.env): LocalCopyConfig {
  return { enabled: on(env.PAPERS_LOCAL_COPY), freshDays: positive(env.PAPERS_LOCAL_FRESH_DAYS, 7) };
}
