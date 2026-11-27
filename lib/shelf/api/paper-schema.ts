import { z } from 'zod';
import { splitPaperId, toDoi } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';

/* A Paper sent by the browser (the details Find Papers already showed). Only
   used when its provider cannot be reached while saving: it is validated,
   capped, and the record is refreshed from the provider later. */

const str = (max: number) => z.string().max(max);
const text = (max: number) => z.string().max(max).nullable().optional().transform((v) => v?.trim() || null);

export const clientPaperSchema = z.object({
  id: str(240),
  provider: str(40),
  record: z.object({ label: z.string().trim().min(1).max(60), url: str(2000) }).nullable().optional().default(null),
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
  referenceIds: z.array(str(240)).max(2000).optional().default([]),
});

const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/* Validated Paper for this paper ID, or null when it does not match or is invalid. */
export function readClientPaper(raw: unknown, id: string): Paper | null {
  const r = clientPaperSchema.safeParse(raw);
  const owner = splitPaperId(id);
  if (!r.success || !owner) return null;
  const v = r.data;
  if (v.id !== id || v.provider !== owner.provider) return null;
  const recordUrl = v.record ? safeUrl(v.record.url) : null;
  return {
    ...v,
    id,
    provider: owner.provider,
    record: v.record && recordUrl ? { label: v.record.label, url: recordUrl } : null,
    doi: toDoi(v.doi),
    authors: v.authors.map((a) => ({ name: a.name, orcid: a.orcid })),
    pdfUrl: safeUrl(v.pdfUrl),
    landingUrl: safeUrl(v.landingUrl),
    referenceIds: v.referenceIds.filter((x) => splitPaperId(x) != null),
  };
}
