/* Shelf settings, from server environment variables so limits can change
   without a code change. Nothing here is sent to the browser.

     SHELF_PDF_MAX_MB          largest PDF a user may upload (default 10)
     SHELF_STORAGE_MB          total PDF storage per user (default 500)
     SHELF_UPLOADS_PER_DAY     PDF uploads per user per day (default 50)
     SHELF_IMPORT_MAX_MB       largest .bib / .ris file (default 4; Vercel caps request bodies at 4.5 MB)
     SHELF_IMPORT_MAX_ENTRIES  most references one import may hold (default 10000)
     SHELF_REFRESH_DAYS        recheck saved papers with their provider this often (default 7)
     SHELF_REFRESH_BATCHES     batches of 50 papers rechecked per background run (default 2)

   Title searches (add by title, PDFs without a DOI) count toward the same daily
   search limit as Find Papers (PAPERS_DAILY_SEARCHES). */

type Env = Record<string, string | undefined>;

export type ShelfConfig = {
  pdfMaxBytes: number;
  storageBytesPerUser: number;
  uploadsPerDay: number;
  importMaxBytes: number;
  importMaxEntries: number;
  refreshDays: number;
  refreshBatches: number;
  /* Most papers one user's shelf may hold (set per plan; see lib/credits/limits.ts). */
  maxItems: number;
};

const MB = 1024 * 1024;

function positive(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
}

export function shelfConfig(env: Env = process.env): ShelfConfig {
  return {
    pdfMaxBytes: Math.floor(positive(env.SHELF_PDF_MAX_MB, 10) * MB),
    storageBytesPerUser: Math.floor(positive(env.SHELF_STORAGE_MB, 500) * MB),
    uploadsPerDay: Math.floor(positive(env.SHELF_UPLOADS_PER_DAY, 50)),
    importMaxBytes: Math.floor(Math.min(4.4, positive(env.SHELF_IMPORT_MAX_MB, 4)) * MB),
    importMaxEntries: Math.floor(positive(env.SHELF_IMPORT_MAX_ENTRIES, 10_000)),
    refreshDays: positive(env.SHELF_REFRESH_DAYS, 7),
    refreshBatches: Math.floor(positive(env.SHELF_REFRESH_BATCHES, 2)),
    maxItems: 1_000_000,
  };
}
