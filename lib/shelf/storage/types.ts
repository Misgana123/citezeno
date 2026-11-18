/* Where uploaded PDFs live. Files are private: the browser uploads straight to
   storage with a one-time signed form (so big files never pass through our
   server, whose request size is limited), and reads them back only through
   short-lived signed links handed to the owner. */

export type UploadTarget = { url: string; fields: Record<string, string> };

export interface FileStore {
  readonly name: string;
  /* A signed form the browser posts the file to, for this key. */
  uploadTarget(key: string): UploadTarget;
  /* The file's bytes (for checking and reading it), or null if it is not there. Larger than maxBytes → null. */
  read(key: string, maxBytes: number): Promise<Uint8Array | null>;
  /* A link that downloads the file for a few minutes. */
  downloadUrl(key: string, opts: { ttlS: number; fileName?: string }): string;
  remove(key: string): Promise<void>;
}
