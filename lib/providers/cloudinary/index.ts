import type { ProviderDefinition } from '../types';
import type { FileStore } from '../storage/types';
import { cloudinaryStore, parseCloudinaryUrl, PROVIDER } from './store';

/* Cloudinary, registered as a file storage provider. Not configured (no
   CLOUDINARY_URL) → null, and PDF uploads are switched off with a clear message. */
export const cloudinaryProvider: ProviderDefinition<FileStore> = {
  name: PROVIDER,
  create(env, gate) {
    const creds = parseCloudinaryUrl(env.CLOUDINARY_URL);
    return creds ? cloudinaryStore(creds, { gate }) : null;
  },
};
