import type { ProviderDefinition } from '../types';
import type { FileStore } from '../storage/types';
import { PROVIDER, r2Config, r2Store } from './store';

/* Cloudflare R2, registered as a file storage provider (the default). Not
   configured (any R2_* key missing) → null, and PDF uploads are switched off
   with a clear message. */
export const r2Provider: ProviderDefinition<FileStore> = {
  name: PROVIDER,
  create(env, gate) {
    const config = r2Config(env);
    return config ? r2Store(config, { gate }) : null;
  },
};
