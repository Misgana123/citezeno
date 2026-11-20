/* Every reader failure becomes a ReaderError with a code the API route turns
   into a status and the UI into a message. Messages are written for the user. */

export type ReaderErrorCode =
  | 'bad_request'
  | 'not_found' // no such paper, or not one this user may open
  | 'no_pdf' // the paper has no PDF we can show
  | 'unavailable' // a service the reader needs is not set up or not reachable
  | 'ai_unavailable' // AI is off (no key), down, or past today's spending cap
  | 'not_ready'; // the paper's text is still being prepared

export class ReaderError extends Error {
  constructor(
    readonly code: ReaderErrorCode,
    message: string,
    readonly details: { reason?: string } = {},
  ) {
    super(message);
    this.name = 'ReaderError';
  }
}

export const isReaderError = (e: unknown): e is ReaderError => (e as Error | null)?.name === 'ReaderError' && typeof (e as ReaderError).code === 'string';

export const READER_STATUS: Record<ReaderErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  no_pdf: 404,
  unavailable: 503,
  ai_unavailable: 503,
  not_ready: 409,
};
