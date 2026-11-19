import type { PaperProviderDefinition } from '../papers/types';
import { createOpenAlexTransport, PROVIDER } from './client';
import { openAlexConfig } from './config';
import { openAlexPolicy } from './policy';
import { SEMANTIC_MAX, openAlexSource } from './source';

/* OpenAlex, registered as a paper data provider. It works without a key
   (OpenAlex's free tier), so it is always available. */
export const openAlexProvider: PaperProviderDefinition = {
  name: PROVIDER,
  limits: (env) => ({ maxQueryChars: openAlexConfig(env).maxQueryChars, semanticMax: SEMANTIC_MAX }),
  create(env, gate) {
    const config = openAlexConfig(env);
    return openAlexSource(gate(createOpenAlexTransport({ config }), openAlexPolicy(config)), config);
  },
};
