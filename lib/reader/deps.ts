import type { Embedder } from '@/lib/providers/embeddings/embedder';
import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PdfPagesReader } from '@/lib/providers/pdf-text/pages';
import type { FileStore } from '@/lib/providers/storage/types';
import type { WebFiles } from '@/lib/providers/web-files/types';
import type { Db } from '@/lib/shelf/db';

/* What the reader's services need, passed in (so tests use fakes). Every
   outside service is a job from the provider registry, never a vendor. */
export type ReaderDeps = {
  db: Db;
  store: FileStore | null;
  web: () => WebFiles;
  pages: () => PdfPagesReader;
  embedder: () => Embedder | null;
  sources: () => PaperSources;
  /* Largest PDF the reader opens or processes, in bytes. */
  maxPdfBytes: number;
  now?: () => number;
};
