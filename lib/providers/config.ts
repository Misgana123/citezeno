import type { Env } from './types';

/* Which provider does each job, from server environment variables, so
   switching vendors is a configuration change:

     PAPER_PROVIDERS          paper data, comma-separated, primary first (default "openalex")
     FILE_STORAGE_PROVIDER    PDF storage (default "r2"; or "cloudinary")
     PDF_TEXT_PROVIDER        reading text out of PDFs (default "basic")
     WEB_FILES_PROVIDER       fetching open-access files and web pages (default "direct-http")
     WEB_SEARCH_PROVIDER      searching the open web for the assistant (default "tavily") */

/* The names chosen for a job that are in its registry. Unknown names are
   skipped with a warning; if none are left, the defaults are used. */
export function chooseProviders<D>(registry: Readonly<Record<string, D>>, raw: string | undefined, defaults: string[], job: string): D[] {
  const names = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter((n) => !Object.hasOwn(registry, n));
  if (unknown.length) console.warn(`[citezeno] providers: unknown ${job} provider(s) ignored: ${unknown.join(', ')}`);
  const known = [...new Set(names.filter((n) => Object.hasOwn(registry, n)))];
  return (known.length ? known : defaults).map((n) => registry[n]);
}

export const choose = {
  papers: (env: Env) => env.PAPER_PROVIDERS,
  fileStorage: (env: Env) => env.FILE_STORAGE_PROVIDER,
  pdfText: (env: Env) => env.PDF_TEXT_PROVIDER,
  webFiles: (env: Env) => env.WEB_FILES_PROVIDER,
  webSearch: (env: Env) => env.WEB_SEARCH_PROVIDER,
};
