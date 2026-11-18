import 'server-only';
import { papersConfig } from './config';
import { createOpenAlexClient, type OpenAlexClient } from './openalex/client';

/* The server's shared OpenAlex client. Importing this file from a client
   component fails the build ("server-only"), which keeps the key out of the
   browser. Parked on globalThis so dev reloads reuse one instance. */
const g = globalThis as unknown as { __czOpenAlex?: OpenAlexClient };

export function openalex(): OpenAlexClient {
  return (g.__czOpenAlex ??= createOpenAlexClient({ config: papersConfig() }));
}
