/* The web files job: fetch a public file (an open-access PDF) from the web on
   our server, because many publisher sites refuse direct downloads from other
   websites. The file comes back as a stream, checked to be a PDF, so large
   files never sit whole in memory and can be passed straight on to the reader. */

export type WebPdf = {
  stream: ReadableStream<Uint8Array>;
  /* the size the site declared, when it did */
  size: number | null;
  /* where the file was found after redirects */
  finalUrl: string;
};

/* Why a file could not be fetched (ProviderError details.reason):
     not_pdf    the link gave something else (often a sign-in or landing page)
     too_large  past the size limit
     blocked    a link we won't follow (not http(s), or a private address)
     not_found  the site said the file isn't there */
export type WebPdfRefusal = 'not_pdf' | 'too_large' | 'blocked' | 'not_found';

export interface WebFiles {
  readonly name: string;
  fetchPdf(url: string, opts: { maxBytes: number }): Promise<WebPdf>;
}
