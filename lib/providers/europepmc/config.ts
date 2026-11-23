import { rateFrom, scholarlyBasics, type ScholarlyBasics } from '../papers/http';
import type { Env } from '../types';

/* Europe PMC settings, from server environment variables:

     EUROPEPMC_RATE_PER_S   calls per second, shared by every server instance
                            (default 7; Europe PMC allows 10 a second, 500 a minute)

   No key needed. */

export type EpmcConfig = ScholarlyBasics & { baseUrl: string; ratePerS: number };

export function epmcConfig(env: Env = process.env): EpmcConfig {
  return {
    ...scholarlyBasics(env),
    baseUrl: (env.EUROPEPMC_BASE_URL?.trim() || 'https://www.ebi.ac.uk/europepmc/webservices/rest').replace(/\/+$/, ''),
    ratePerS: rateFrom(env.EUROPEPMC_RATE_PER_S, 7, 8),
  };
}
