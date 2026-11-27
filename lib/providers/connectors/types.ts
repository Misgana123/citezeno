import type { Env, Gate } from '../types';

/* The connector job: a user's own account at another app (cloud files,
   documents, spreadsheets, notes, a reference manager), connected so the app
   and the assistant can read from it and write to it on their behalf.

   A connector is one adapter in lib/providers/<vendor>/. It says how a user
   connects (OAuth 2, OAuth 1.0a or a pasted key) and, once connected, which
   capabilities it gives. Features ask for a capability ("references",
   "files"…), never for a vendor. Every outside call goes through the gateway. */

/* ---------- connecting ---------- */

/* What a finished connection holds. Kept sealed in our database; never sent to
   the browser or the model. */
export type Credentials = {
  accessToken: string;
  refreshToken?: string | null;
  /* epoch ms; null or absent: the token doesn't expire */
  expiresAt?: number | null;
  scopes?: string[];
  /* who connected, as the vendor knows them */
  account: { id: string; label: string };
  /* vendor details the adapter needs later (Zotero's user ID, Notion's workspace) */
  meta?: Record<string, string | number | boolean | null>;
};

/* OAuth 2 authorization code flow, with PKCE when the vendor supports it. */
export type OAuth2Auth = {
  type: 'oauth2';
  authorizeUrl(p: { state: string; redirectUri: string; codeChallenge: string }): string;
  exchange(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<Credentials>;
  /* a fresh access token; the result keeps the old refresh token when the vendor sends none */
  refresh?(c: Credentials): Promise<Credentials>;
};

/* OAuth 1.0a (Zotero): a request token, the user's approval, then an access token. */
export type OAuth1Auth = {
  type: 'oauth1';
  begin(p: { callbackUrl: string }): Promise<{ authorizeUrl: string; token: string; tokenSecret: string }>;
  finish(p: { token: string; tokenSecret: string; verifier: string }): Promise<Credentials>;
};

/* A key the user pastes (checked with the vendor before it is kept). */
export type ApiKeyAuth = {
  type: 'api-key';
  /* where the user makes a key, shown next to the field */
  helpUrl: string;
  check(key: string): Promise<Credentials>;
};

/* ---------- capabilities ---------- */

/* A file in the user's cloud storage the app may see (with narrow access: the
   files they picked and the files the app made). */
export type CloudFile = {
  id: string;
  name: string;
  mime: string;
  /* the vendor's own kind for documents and spreadsheets made in its editors */
  kind: 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'folder' | 'other';
  sizeBytes: number | null;
  modifiedAt: string | null;
  url: string | null;
};

export type DownloadedFile = { name: string; mime: string; bytes: Uint8Array };

export interface CloudFiles {
  /* files the app may see, newest first; with a query, those whose name contains it */
  list(opts: { query?: string; limit: number }): Promise<CloudFile[]>;
  get(id: string): Promise<CloudFile>;
  /* the file's bytes. Editor documents come as `as` (default: .docx / .xlsx / .pptx). */
  download(id: string, opts: { maxBytes: number; as?: 'pdf' | 'text' | 'csv' | 'office' }): Promise<DownloadedFile>;
  /* a new file; `convert` turns an office file into the vendor's own document or spreadsheet */
  upload(f: { name: string; mime: string; bytes: Uint8Array; convert?: boolean }): Promise<CloudFile>;
}

export interface CloudDocuments {
  readText(id: string, maxChars: number): Promise<{ title: string; text: string; url: string | null }>;
  /* a new editable document from a .docx */
  createFromDocx(f: { title: string; bytes: Uint8Array }): Promise<CloudFile>;
}

export type SheetValues = { title: string; sheets: string[]; range: string; rows: string[][]; url: string | null };

export interface CloudSheets {
  read(id: string, opts: { sheet?: string; range?: string; maxRows: number }): Promise<SheetValues>;
  append(id: string, rows: (string | number | boolean | null)[][], opts: { sheet?: string }): Promise<{ appended: number; url: string | null }>;
  create(f: { title: string; sheets: { name: string; rows: (string | number | boolean | null)[][] }[] }): Promise<CloudFile>;
}

/* A page's content, vendor-neutral. Text may use **bold**, *italic*, `code` and [links](https://…). */
export type PageBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'divider' };

export type NotesItem = { id: string; title: string; kind: 'page' | 'database'; url: string | null; editedAt: string | null };

/* A database's columns, so rows can be filled in by name. */
export type NotesColumn = { name: string; type: 'title' | 'text' | 'number' | 'url' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'other' };

export interface NotesPages {
  /* pages and databases the user shared with the app */
  search(opts: { query?: string; kind?: 'page' | 'database'; limit: number }): Promise<NotesItem[]>;
  read(id: string, maxChars: number): Promise<{ title: string; markdown: string; url: string | null }>;
  /* a new page inside a shared page */
  create(f: { parentId: string; title: string; blocks: PageBlock[] }): Promise<NotesItem>;
  columns(databaseId: string): Promise<{ title: string; columns: NotesColumn[] }>;
  /* new rows in a shared database; values by column name, unknown columns ignored */
  addRows(databaseId: string, rows: Record<string, string | number | boolean | null | string[]>[]): Promise<{ added: number; url: string | null }>;
}

/* A library in the user's reference manager: their own, or a group's. */
export type RefLibrary = { id: string; name: string; kind: 'user' | 'group'; canWrite: boolean };
export type RefCollection = { key: string; name: string; parentKey: string | null; items: number | null };

/* One reference, as reference managers and the shelf both understand it. */
export type RefItem = {
  key: string;
  version: number;
  /* Citezeno's work type (article, book, chapter…) */
  type: string;
  title: string | null;
  authors: string[];
  year: number | null;
  source: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  tags: string[];
  collections: string[];
};

export type RefItemInput = Omit<RefItem, 'key' | 'version' | 'collections' | 'tags'> & { tags?: string[] };

export interface ReferenceLibrary {
  libraries(): Promise<RefLibrary[]>;
  collections(libraryId: string): Promise<RefCollection[]>;
  /* references (no notes or attachments), oldest change first; `since` gives only those changed after that library version */
  items(libraryId: string, opts: { collectionKey?: string | null; since?: number; start: number; limit: number }): Promise<{ items: RefItem[]; total: number; version: number }>;
  search(libraryId: string, query: string, limit: number): Promise<RefItem[]>;
  createCollection(libraryId: string, name: string): Promise<RefCollection>;
  addItems(libraryId: string, items: RefItemInput[], opts: { collectionKey?: string | null }): Promise<{ added: number; failed: number }>;
}

export type Capabilities = {
  files: CloudFiles;
  documents: CloudDocuments;
  sheets: CloudSheets;
  pages: NotesPages;
  references: ReferenceLibrary;
};
export type Capability = keyof Capabilities;
export const CAPABILITIES = ['files', 'documents', 'sheets', 'pages', 'references'] as const satisfies readonly Capability[];

/* ---------- picking files in the browser ---------- */

/* With narrow access the user grants files one by one, in the vendor's own
   picker shown on our page. It needs a short-lived access token in the
   owner's browser (never the refresh token). */
export type FilePicker = {
  type: 'google-picker';
  scriptUrl: string;
  apiKey: string;
  appId: string;
  accessToken: string;
};

/* ---------- the connector ---------- */

export type Connector = {
  readonly name: string;
  /* ways to connect, the first the main one; a key is the fallback where both exist */
  auth: { signIn: OAuth2Auth | OAuth1Auth | null; apiKey: ApiKeyAuth | null };
  /* the capabilities this connection gives, for one user's credentials */
  open(c: Credentials): Partial<Capabilities>;
  /* withdraw our access at the vendor (best effort) */
  revoke?(c: Credentials): Promise<void>;
  /* the vendor's file picker, when it has one and it is set up */
  picker?(c: Credentials): FilePicker | null;
};

export type ConnectorDefinition = {
  readonly name: string;
  readonly label: string;
  /* what connecting lets the user do, in one sentence */
  readonly description: string;
  /* the parts of the app a connection covers, as the user knows them ("Drive", "Docs", "Sheets") */
  readonly services: readonly string[];
  readonly capabilities: readonly Capability[];
  /* null when it isn't set up (missing client ID); a key-only connector is always available */
  create(env: Env, gate: Gate): Connector | null;
};

/* The vendor refused the user's token (expired, revoked): they need to connect again. */
export class ConnectorAuthError extends Error {
  constructor(
    readonly connector: string,
    message = 'The connection was refused.',
  ) {
    super(message);
    this.name = 'ConnectorAuthError';
  }
}

export const isConnectorAuthError = (e: unknown): e is ConnectorAuthError => (e as Error | null)?.name === 'ConnectorAuthError';
