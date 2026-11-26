import type { Meter } from '@/lib/credits/meter';
import type { ChatModels } from '@/lib/providers/chat/catalog';
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
  /* The chat models on offer (summaries, answers, Explain); absent → AI is off. */
  chat?: () => ChatModels | Promise<ChatModels>;
  /* The paid action this request belongs to (a reader request, or an assistant
     reply using a reader tool): every AI call reserves and records its cost
     here. Absent → nothing is charged (the owner's cost). */
  meter?: Meter;
  /* The one-time charge for embedding a user's own upload (made once per text,
     resumed across job runs). Absent → embedding is free (the owner's cost). */
  embedMeter?: (t: { userId: string; textId: string; paperId: string }) => Meter;
  /* Largest PDF the reader opens or processes, in bytes. */
  maxPdfBytes: number;
  now?: () => number;
};
