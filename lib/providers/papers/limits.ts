import { choose, chooseProviders } from '../config';
import type { Env } from '../types';
import { DEFAULT_PAPER_PROVIDERS, PAPER_PROVIDERS } from './registry';
import type { PaperSource } from './types';

/* Limits of the primary paper provider, without building it (for the search form). */
export function primaryPaperLimits(env: Env = process.env): PaperSource['limits'] {
  const [def] = chooseProviders(PAPER_PROVIDERS, choose.papers(env), DEFAULT_PAPER_PROVIDERS, 'paper');
  return def.limits(env);
}
