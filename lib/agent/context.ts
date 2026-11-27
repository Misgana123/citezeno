import type { Meter } from '@/lib/credits/meter';
import type { PapersConfig } from '@/lib/papers/config';
import type { Limits } from '@/lib/plans';
import type { Attachment } from '@/lib/providers/chat/types';
import type { Capabilities, Capability } from '@/lib/providers/connectors/types';
import type { PaperSources } from '@/lib/providers/papers/sources';
import type { PdfTextReader } from '@/lib/providers/pdf-text/types';
import type { WebFiles } from '@/lib/providers/web-files/types';
import type { WebSearch } from '@/lib/providers/web-search/types';
import type { Db } from '@/lib/shelf/db';
import type { ShelfConfig } from '@/lib/shelf/config';
import type { AgentFiles } from './files';
import type { CodeRunner } from './sandbox';

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
  /* The open web (through the gateway): search (null when not set up), and reading pages and online PDFs. */
  webSearch(): WebSearch | null;
  webFiles(): WebFiles;
  pdfText(): PdfTextReader;
  /* The files the user attached to this chat (pictures, and the text of other files), oldest first. */
  chatAttachments(): Promise<Attachment[]>;
  /* The chat's code sandbox (run_python), or null when it isn't set up. */
  code(): CodeRunner | null;
  /* Files the tools make for this conversation (documents, charts…). */
  files: AgentFiles;
  /* This reply's credits: tools that call paid services outside the gateway
     (the reader's AI) charge them here. Absent → not charged. */
  credits?: Meter;
  /* What the user's plan allows (web searches per reply, Python time…). */
  limits?: Limits;
  /* The user's connected apps (Google Drive, Notion, Zotero…): which capability
     each gives, and one ready to call (as the user, through the gateway).
     Absent → none connected. */
  connectors?: AgentConnectors;
};

export type AgentConnectors = {
  /* capability → the app's name, for the connections that work */
  connected: ReadonlyMap<Capability, { name: string; label: string }>;
  open<C extends Capability>(cap: C): Promise<{ api: Capabilities[C]; connector: string; label: string }>;
};
