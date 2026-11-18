import { z } from 'zod';
import { READING_STATUSES } from '../types';

/* The JSON bodies the /api/shelf routes accept. */

export const ID = z.string().trim().min(1).max(80);
export const NAME = z.string().trim().min(1, 'Give it a name.').max(80, 'Keep the name under 80 characters.');
export const NOTE_MAX = 20_000;

/* POST /api/shelf/papers: the ways a paper reaches the shelf. */
export const saveBody = z.discriminatedUnion('via', [
  z.object({ via: z.literal('search'), paperId: z.string().trim().min(1).max(60), paper: z.unknown().optional(), projectId: ID.nullish() }),
]);

/* PATCH /api/shelf/papers/:id */
export const itemPatchBody = z
  .object({
    note: z.string().max(NOTE_MAX, 'Notes are limited to 20,000 characters.').nullable().optional(),
    readingStatus: z.enum(READING_STATUSES).optional(),
  })
  .strict();

export const projectBody = z.object({ name: NAME });
