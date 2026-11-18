import { toPaper } from '@/lib/papers/mapper';
import type { OpenAlexClient } from '@/lib/papers/openalex/client';
import { DETAIL_FIELDS, selectParam } from '@/lib/papers/openalex/fields';
import type { OpenAlexWork } from '@/lib/papers/openalex/types';
import type { Paper } from '@/lib/papers/types';
import { papersErrorCode } from '../papers-error';

/* Look up many DOIs at once: 50 per call with filter=doi:a|b|… (a list call,
   far cheaper than searching). DOIs a filter can't carry (commas, pipes) are
   looked up one by one, which is free. Returns the papers found, by DOI. */

export const DOIS_PER_CALL = 50;

export async function lookupDois(client: OpenAlexClient, dois: string[]): Promise<Map<string, Paper>> {
  const found = new Map<string, Paper>();
  const unique = [...new Set(dois.map((d) => d.toLowerCase()))];
  const safe = unique.filter((d) => !/[,|]/.test(d));
  for (let i = 0; i < safe.length; i += DOIS_PER_CALL) {
    const chunk = safe.slice(i, i + DOIS_PER_CALL);
    const { body } = await client.get<{ results?: OpenAlexWork[] }>('/works', { filter: `doi:${chunk.join('|')}`, per_page: DOIS_PER_CALL, select: selectParam(DETAIL_FIELDS) });
    for (const w of body.results ?? []) {
      const p = toPaper(w);
      if (p?.doi) found.set(p.doi, p);
    }
  }
  for (const doi of unique.filter((d) => /[,|]/.test(d))) {
    try {
      const { body } = await client.get<OpenAlexWork>(`/works/doi:${doi}`, { select: selectParam(DETAIL_FIELDS) });
      const p = toPaper(body);
      if (p) found.set(doi, p);
    } catch (e) {
      if (papersErrorCode(e) !== 'not_found') throw e;
    }
  }
  return found;
}
