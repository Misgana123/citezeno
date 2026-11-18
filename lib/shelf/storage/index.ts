import { cloudinaryStore, parseCloudinaryUrl } from './cloudinary';
import type { FileStore } from './types';

/* The configured PDF storage, or null when CLOUDINARY_URL is not set (uploads
   are then switched off with a clear message). */
let cached: { url: string | undefined; store: FileStore | null } | null = null;

export function fileStore(env: Record<string, string | undefined> = process.env): FileStore | null {
  if (cached && cached.url === env.CLOUDINARY_URL) return cached.store;
  const creds = parseCloudinaryUrl(env.CLOUDINARY_URL);
  cached = { url: env.CLOUDINARY_URL, store: creds ? cloudinaryStore(creds) : null };
  return cached.store;
}
