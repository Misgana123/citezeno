import type { PapersConfig } from '@/lib/papers/config';
import type { PaperSources } from '@/lib/providers/papers/sources';
import type { Db } from '@/lib/shelf/db';
import type { ShelfConfig } from '@/lib/shelf/config';
import type { AgentFiles } from './files';

/* Everything an agent tool may use. The agent acts as the user: the same
   user ID, the same paper sources (through the gateway), the same daily
   search limit and the same shelf limits as the app's buttons. It can only
   see and change this user's own library. */
export type AgentContext = {
  userId: string;
  db: Db;
  sources(): PaperSources;
  papersConfig: PapersConfig;
  shelfConfig: ShelfConfig;
  /* Hold n of the user's daily searches; unused ones are given back when the request ends. */
  reserveSearches(n: number): Promise<void>;
  /* Files the tools make for this conversation (documents, charts…). */
  files: AgentFiles;
};
