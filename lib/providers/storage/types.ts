/* Where uploaded PDFs live. Files are private: the browser uploads straight to
   storage with a one-time signed request (so big files never pass through our
   server, whose request size is limited), and reads them back only through
   short-lived signed links handed to the owner. */

/* How the browser sends the file. A form POST (the default) sends `fields`
   plus the file as "file"; a PUT sends the raw file with `headers`. */
export type UploadTarget = { url: string; fields: Record<string, string>; method?: 'POST' | 'PUT'; headers?: Record<string, string> };

export interface FileStore {
  readonly name: string;
  /* A signed request the browser sends the file with, for this key. */
  uploadTarget(key: string): UploadTarget;
  /* The file's bytes (for checking and reading it), or null if it is not there. Larger than maxBytes → null. */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  /* Store a file from our server (e.g. a shared open-access copy). */
  write(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /* A link to the file for a few minutes: a download, or shown in the browser when `inline`. */
  downloadUrl(key: string, opts: { ttlS: number; fileName?: string; inline?: boolean }): string;
  remove(key: string): Promise<void>;
}
