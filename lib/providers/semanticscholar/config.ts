import { rateFrom, scholarlyBasics, type ScholarlyBasics } from '../papers/http';
import type { Env } from '../types';

/* Semantic Scholar settings, from server environment variables:

     S2_API_KEY          the free key from semanticscholar.org/product/api (server only).
                         Required: without it the shared public pool is usually full.
     S2_RATE_PER_S       calls per second, shared by every server instance
                         (default 0.9: a new key allows 1 a second; raise it if yours allows more) */

export type S2Config = ScholarlyBasics & { baseUrl: string; apiKey: string | null; ratePerS: number };

export function s2Config(env: Env = process.env): S2Config {
  return {
    ...scholarlyBasics(env),
    baseUrl: (env.S2_BASE_URL?.trim() || 'https://api.semanticscholar.org').replace(/\/+$/, ''),
    apiKey: env.S2_API_KEY?.trim() || null,
    ratePerS: rateFrom(env.S2_RATE_PER_S, 0.9, 100),
  };
}
