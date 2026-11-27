import { cloudinaryProvider } from '../cloudinary';
import { r2Provider } from '../r2';
import type { ProviderDefinition } from '../types';
import type { FileStore } from './types';

/* Every file storage provider. To add one: implement FileStore in
   lib/providers/<name>/, add it here, and set FILE_STORAGE_PROVIDER. */
export const FILE_STORAGE_PROVIDERS: Readonly<Record<string, ProviderDefinition<FileStore>>> = {
  [r2Provider.name]: r2Provider,
  [cloudinaryProvider.name]: cloudinaryProvider,
};

/* Cloudflare R2 by default; FILE_STORAGE_PROVIDER=cloudinary keeps the earlier storage. */
export const DEFAULT_FILE_STORAGE = [r2Provider.name];
