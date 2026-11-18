import type { FileStore } from './types';

/* In-memory storage for tests. `put` stands in for the browser's upload. */
export function memoryStore(): FileStore & { put(key: string, bytes: Uint8Array): void; has(key: string): boolean } {
  const files = new Map<string, Uint8Array>();
  return {
    name: 'memory',
    put: (key, bytes) => void files.set(key, bytes),
    has: (key) => files.has(key),
    uploadTarget: (key) => ({ url: 'memory://upload', fields: { public_id: key } }),
    async read(key, maxBytes) {
      const f = files.get(key);
      return !f || f.byteLength > maxBytes ? null : f;
    },
    downloadUrl: (key) => `memory://download/${encodeURIComponent(key)}`,
    async remove(key) {
      files.delete(key);
    },
  };
}
