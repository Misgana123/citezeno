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

export const folderBody = z.object({ projectId: ID, name: NAME });
export const renameBody = z.object({ name: NAME });

const COLOR = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Pick a color from the list.')
  .nullable();
export const tagBody = z.object({ name: NAME, color: COLOR.optional().default(null) });
export const tagPatchBody = z.object({ name: NAME.optional(), color: COLOR.optional() });

const IDS = z.array(ID).min(1, 'Select at least one paper.').max(500, 'Select at most 500 papers at a time.');

/* POST /api/shelf/bulk: one action on several papers (or one). */
export const bulkBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), ids: IDS, projectId: ID.nullish(), folderId: ID.nullish() }),
  z.object({ action: z.literal('add_project'), ids: IDS, projectId: ID }),
  z.object({ action: z.literal('remove_project'), ids: IDS, projectId: ID }),
  z.object({ action: z.literal('add_folder'), ids: IDS, folderId: ID }),
  z.object({ action: z.literal('remove_folder'), ids: IDS, folderId: ID }),
  z.object({ action: z.literal('tag'), ids: IDS, tagIds: z.array(ID).max(50).optional().default([]), tagNames: z.array(NAME).max(20).optional().default([]) }),
  z.object({ action: z.literal('untag'), ids: IDS, tagIds: z.array(ID).min(1).max(50) }),
  z.object({ action: z.literal('status'), ids: IDS, status: z.enum(READING_STATUSES) }),
  z.object({ action: z.literal('delete'), ids: IDS }),
]);
export type BulkBody = z.infer<typeof bulkBody>;
