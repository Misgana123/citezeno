import { z } from 'zod';
import { toDoi, toWorkId } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';

/* A Paper sent by the browser (the details Find Papers already showed). Only
   used when OpenAlex cannot be reached while saving: it is validated, capped,
   and the record is refreshed from OpenAlex later. */

const str = (max: number) => z.string().max(max);
const text = (max: number) => z.string().max(max).nullable().optional().transform((v) => v?.trim() || null);

export const clientPaperSchema = z.object({
  id: str(40),
  openalexId: str(40),
  doi: text(300),
  title: z.string().trim().min(1).max(1000),
  authors: z.array(z.object({ name: z.string().trim().min(1).max(300), orcid: text(40) })).max(500).default([]),
  year: z.number().int().min(1000).max(3000).nullable().optional().default(null),
  publicationDate: text(40),
  source: text(500),
  type: text(60),
  language: text(20),
  abstract: text(20_000),
  citedByCount: z.number().int().min(0).max(100_000_000).optional().default(0),
  isOpenAccess: z.boolean().optional().default(false),
  pdfUrl: text(2000),
  landingUrl: text(2000),
  isRetracted: z.boolean().optional().default(false),
  topics: z.array(str(300)).max(50).optional().default([]),
  referencedWorkIds: z.array(str(40)).max(2000).optional().default([]),
});

const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/* Validated Paper for this OpenAlex ID, or null when it does not match or is invalid. */
export function readClientPaper(raw: unknown, openalexId: string): Paper | null {
  const r = clientPaperSchema.safeParse(raw);
  if (!r.success) return null;
  const v = r.data;
  if (toWorkId(v.openalexId) !== openalexId) return null;
  return {
    ...v,
    id: openalexId,
    openalexId,
    doi: toDoi(v.doi),
    authors: v.authors.map((a) => ({ name: a.name, orcid: a.orcid })),
    pdfUrl: safeUrl(v.pdfUrl),
    landingUrl: safeUrl(v.landingUrl),
    referencedWorkIds: v.referencedWorkIds.map((x) => toWorkId(x)).filter((x): x is string => !!x),
  };
}
