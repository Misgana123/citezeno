import { cloudinaryProvider } from '../cloudinary';
import type { ProviderDefinition } from '../types';
import type { FileStore } from './types';

/* Every file storage provider. To add one: implement FileStore in
   lib/providers/<name>/, add it here, and set FILE_STORAGE_PROVIDER. */
export const FILE_STORAGE_PROVIDERS: Readonly<Record<string, ProviderDefinition<FileStore>>> = {
  [cloudinaryProvider.name]: cloudinaryProvider,
};

export const DEFAULT_FILE_STORAGE = [cloudinaryProvider.name];
