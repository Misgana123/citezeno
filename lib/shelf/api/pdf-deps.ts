import 'server-only';
import { allow } from '@/lib/ratelimit';
import type { ShelfContext } from '../route';
import type { MatchDeps, PdfDeps } from '../service/pdf-upload';
import { fileStore } from '../storage';

/* What the PDF routes need, from the request context. Daily uploads are
   counted over a rolling day with the app's shared rate-limit table. */
export const pdfDeps = (ctx: ShelfContext): PdfDeps & MatchDeps => ({
  db: ctx.db,
  store: fileStore(),
  config: ctx.config,
  allowUpload: () => allow(`shelf-upload:${ctx.userId}`, 86_400, ctx.config.uploadsPerDay),
  client: ctx.openalex,
  reserveSearch: () => ctx.reserveSearches(1),
});
