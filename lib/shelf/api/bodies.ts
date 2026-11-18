import { z } from 'zod';
import { READING_STATUSES } from '../types';
import { manualPaperSchema } from './manual-schema';

/* The JSON bodies the /api/shelf routes accept. */

export const ID = z.string().trim().min(1).max(80);
export const NAME = z.string().trim().min(1, 'Give it a name.').max(80, 'Keep the name under 80 characters.');
export const NOTE_MAX = 20_000;

/* POST /api/shelf/papers: the ways a paper reaches the shelf. */
const PAPER_ID = z.string().trim().min(1).max(60);
export const saveBody = z.discriminatedUnion('via', [
  z.object({ via: z.literal('search'), paperId: PAPER_ID, paper: z.unknown().optional(), projectId: ID.nullish() }),
  z.object({ via: z.enum(['doi', 'link', 'title']), paperId: PAPER_ID, projectId: ID.nullish() }),
  z.object({ via: z.literal('manual'), details: manualPaperSchema, projectId: ID.nullish() }),
]);

/* POST /api/shelf/lookup */
export const lookupBody = z.object({ input: z.string().max(2000, 'That is too long to look up.') });

/* PATCH /api/shelf/papers/:id */
export const itemPatchBody = z
  .object({
    note: z.string().max(NOTE_MAX, 'Notes are limited to 20,000 characters.').nullable().optional(),
    readingStatus: z.enum(READING_STATUSES).optional(),
    /* only for papers added by hand or imported */
    details: manualPaperSchema.optional(),
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

/* POST /api/shelf/duplicates */
export const duplicateBody = z.object({ action: z.enum(['merge', 'keep_both']), a: ID, b: ID });

/* POST /api/shelf/pdfs: about to upload one PDF (optionally onto an item). */
export const pdfBeginBody = z.object({
  fileName: z.string().trim().min(1).max(300),
  sizeBytes: z.number().int().min(1, 'This file is empty.'),
  itemId: ID.nullish(),
});

/* POST /api/shelf/pdfs/:id/confirm: which paper the PDF is. */
export const pdfConfirmBody = z.union([
  z.object({ paperId: z.string().trim().min(1).max(60), projectId: ID.nullish() }),
  z.object({ itemId: ID }),
  z.object({ details: manualPaperSchema, projectId: ID.nullish() }),
]);

/* POST /api/shelf/imports: a .bib / .ris file's text (read in the browser). */
export const importBody = z.object({
  fileName: z.string().trim().min(1).max(300),
  text: z.string().min(1, 'This file is empty.'),
  projectId: ID.nullish(),
  newProject: NAME.nullish(),
});
