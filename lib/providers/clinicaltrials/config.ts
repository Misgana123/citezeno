import { rateFrom, scholarlyBasics, type ScholarlyBasics } from '../papers/http';
import type { Env } from '../types';

/* ClinicalTrials.gov settings, from server environment variables:

     CLINICALTRIALS_RATE_PER_S   calls per second, shared by every server instance
                                 (default 0.6, about 36 a minute: it publishes no hard limit,
                                 and about 50 a minute is the commonly reported ceiling)

   No key needed. */

export type CtConfig = ScholarlyBasics & { baseUrl: string; ratePerS: number };

export function ctConfig(env: Env = process.env): CtConfig {
  return {
    ...scholarlyBasics(env),
    baseUrl: (env.CLINICALTRIALS_BASE_URL?.trim() || 'https://clinicaltrials.gov/api/v2').replace(/\/+$/, ''),
    ratePerS: rateFrom(env.CLINICALTRIALS_RATE_PER_S, 0.6, 3),
  };
}
