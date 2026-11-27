import { rateFrom, scholarlyBasics, type ScholarlyBasics } from '../papers/http';
import type { Env } from '../types';

/* arXiv settings, from server environment variables:

     ARXIV_RATE_PER_S     calls per second, shared by every server instance
                          (default 0.3: arXiv asks for one call every 3 seconds, one at a time)

   Cache times, the wait limit and the contact email are shared by every paper
   source (lib/providers/papers/http.ts). arXiv needs no key. */

export type ArxivConfig = ScholarlyBasics & { baseUrl: string; ratePerS: number };

export function arxivConfig(env: Env = process.env): ArxivConfig {
  return {
    ...scholarlyBasics(env),
    baseUrl: (env.ARXIV_BASE_URL?.trim() || 'https://export.arxiv.org/api').replace(/\/+$/, ''),
    ratePerS: rateFrom(env.ARXIV_RATE_PER_S, 0.3, 0.34),
  };
}
