import type { PaperSource } from '@/lib/providers/papers/types';
import type { Paper } from '@/lib/papers/types';

/* Look up many DOIs at once. A source that can fetch many papers per call
   does (OpenAlex: 50 per list call, far cheaper than searching); otherwise
   they are looked up one by one. Returns the papers found, by DOI (lowercased). */
export async function lookupDois(papers: PaperSource, dois: string[]): Promise<Map<string, Paper>> {
  const unique = [...new Set(dois.map((d) => d.toLowerCase()))];
  if (papers.getPapers) return (await papers.getPapers('doi', unique)).found;
  const found = new Map<string, Paper>();
  for (const doi of unique) {
    const { paper } = await papers.getPaper({ kind: 'doi', doi });
    if (paper) found.set(doi, paper);
  }
  return found;
}
