import { rateFrom, scholarlyBasics, type ScholarlyBasics } from '../papers/http';
import type { Env } from '../types';

/* PubMed (NCBI E-utilities) settings, from server environment variables:

     NCBI_API_KEY         optional free key (raises NCBI's limit from 3 to 10 calls a second)
     PUBMED_RATE_PER_S    calls per second, shared by every server instance
                          (default 2.5 without a key, 8 with one)

   NCBI asks callers to name their tool and a contact email: we send "citezeno"
   and PROVIDER_CONTACT_EMAIL. */

export type PubmedConfig = ScholarlyBasics & { baseUrl: string; apiKey: string | null; ratePerS: number };

export function pubmedConfig(env: Env = process.env): PubmedConfig {
  const apiKey = env.NCBI_API_KEY?.trim() || null;
  return {
    ...scholarlyBasics(env),
    baseUrl: (env.PUBMED_BASE_URL?.trim() || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils').replace(/\/+$/, ''),
    apiKey,
    ratePerS: apiKey ? rateFrom(env.PUBMED_RATE_PER_S, 8, 10) : rateFrom(env.PUBMED_RATE_PER_S, 2.5, 3),
  };
}
