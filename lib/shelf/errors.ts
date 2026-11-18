/* Every Shelf failure becomes a ShelfError with a code the API route turns into
   a status and the UI into a message. Messages are written for the user. */

export type ShelfErrorCode =
  | 'bad_request' // the request was invalid
  | 'not_found' // no such item/project/tag/file in this user's shelf
  | 'duplicate' // the paper is already on the shelf (details.itemId points to it)
  | 'name_taken' // a project, folder or tag with that name already exists
  | 'too_large' // a file is over the size limit
  | 'storage_full' // the user's storage is full
  | 'user_limit' // a per-user daily limit was reached
  | 'invalid_file' // not a real PDF / not a reference file
  | 'unavailable'; // a service the feature needs is not set up or not reachable

export class ShelfError extends Error {
  constructor(
    readonly code: ShelfErrorCode,
    message: string,
    readonly details: { itemId?: string; limit?: number; resetsAt?: string } = {},
  ) {
    super(message);
    this.name = 'ShelfError';
  }
}

export const isShelfError = (e: unknown): e is ShelfError => e instanceof ShelfError;

export const SHELF_STATUS: Record<ShelfErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  duplicate: 409,
  name_taken: 409,
  too_large: 413,
  storage_full: 413,
  user_limit: 429,
  invalid_file: 415,
  unavailable: 503,
};

/* Postgres unique violation → name_taken. */
export function uniqueToNameTaken(e: unknown, what: string): never {
  if ((e as { code?: string })?.code === '23505') throw new ShelfError('name_taken', `You already have a ${what} with that name.`);
  throw e;
}
