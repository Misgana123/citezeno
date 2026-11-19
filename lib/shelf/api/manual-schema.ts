import { z } from 'zod';
import { toDoi } from '@/lib/papers/ids';
import type { Paper } from '@/lib/papers/types';

/* A paper typed in by hand (title, authors, year, source, link). Also used to
   correct the details of a manual or imported paper. */

const maxYear = () => new Date().getUTCFullYear() + 1;
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const manualPaperSchema = z.object({
  title: z.string().trim().min(1, 'Give the paper a title.').max(1000, 'That title is too long.'),
  authors: z.array(z.string().trim().min(1).max(300)).max(200, 'List at most 200 authors.').optional().default([]),
  year: z
    .number()
    .int()
    .min(1000, 'Check the year.')
    .refine((y) => y <= maxYear(), 'Check the year.')
    .nullish()
    .transform((v) => v ?? null),
  source: optText(500),
  url: optText(2000).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), 'The link must start with http:// or https://'),
  doi: optText(300).refine((v) => !v || toDoi(v) != null, 'That DOI doesn’t look right. It should start with 10.'),
  type: optText(60),
  abstract: optText(20_000),
});
export type ManualPaperInput = z.infer<typeof manualPaperSchema>;

/* The Citezeno Paper details for a manual entry (no provider record). */
export function manualDetails(v: ManualPaperInput): Omit<Paper, 'id' | 'provider'> {
  return {
    record: null,
    doi: toDoi(v.doi),
    title: v.title,
    authors: v.authors.map((name) => ({ name, orcid: null })),
    year: v.year,
    publicationDate: null,
    source: v.source,
    type: v.type,
    language: null,
    abstract: v.abstract,
    citedByCount: 0,
    isOpenAccess: false,
    pdfUrl: null,
    landingUrl: v.url,
    isRetracted: false,
    topics: [],
    referenceIds: [],
  };
}
