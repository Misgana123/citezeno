/* The web files job: fetch a public file (an open-access PDF) from the web on
   our server, because many publisher sites refuse direct downloads from other
   websites. The file comes back as a stream, checked to be a PDF, so large
   files never sit whole in memory and can be passed straight on to the reader.

   It also reads a public web page for the assistant (web_fetch): the page's
   main text, without menus, ads and scripts; and downloads a file for it
   (download_file): a document, data, reference file, picture or archive. */

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

/* A web page's readable text. */
export type WebPage = {
  title: string | null;
  text: string;
  /* where the page was found after redirects */
  finalUrl: string;
};

/* Why a page could not be read (ProviderError details.reason): the PDF reasons,
   plus is_pdf (the link is a PDF: read it with fetchPdf) and not_page (another
   kind of file, or a page with no readable text). */
export type WebPageRefusal = Exclude<WebPdfRefusal, 'not_pdf'> | 'is_pdf' | 'not_page';

/* A downloaded file, its kind found from its first bytes. */
export type WebFile = {
  bytes: Uint8Array;
  /* "data.csv": the site's name for it, with its kind's extension */
  name: string;
  mime: string;
  finalUrl: string;
};

/* Why a file could not be downloaded (ProviderError details.reason): the PDF
   reasons but not_pdf, plus is_page (the link is a web page: read it with
   fetchPage) and not_file (a kind of file that isn't kept). */
export type WebFileRefusal = Exclude<WebPdfRefusal, 'not_pdf'> | 'is_page' | 'not_file';

export interface WebFiles {
  readonly name: string;
  fetchPdf(url: string, opts: { maxBytes: number }): Promise<WebPdf>;
  fetchPage(url: string, opts: { maxBytes: number }): Promise<WebPage>;
  fetchFile(url: string, opts: { maxBytes: number }): Promise<WebFile>;
}
