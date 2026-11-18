import type { ManualPaperInput } from '@/lib/shelf/api/manual-schema';

/* The manual-entry form's fields as typed, and the request they become. */

export type ManualDraft = { title: string; authors: string; year: string; source: string; url: string; doi: string };

export const emptyDraft = (over: Partial<ManualDraft> = {}): ManualDraft => ({ title: '', authors: '', year: '', source: '', url: '', doi: '', ...over });

/* One author per line, or separated by semicolons. */
export function draftToInput(d: ManualDraft): ManualPaperInput {
  return {
    title: d.title.trim(),
    authors: d.authors
      .split(/[\n;]+/)
      .map((a) => a.trim())
      .filter(Boolean),
    year: d.year.trim() ? Number(d.year) : null,
    source: d.source.trim() || null,
    url: d.url.trim() || null,
    doi: d.doi.trim() || null,
    type: null,
    abstract: null,
  };
}
