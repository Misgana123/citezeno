import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // the Postgres tests each build a throwaway schema in beforeAll; with many files at once that can pass 10 s
  test: { include: ['tests/**/*.test.ts'], environment: 'node', hookTimeout: 30_000 },
});
