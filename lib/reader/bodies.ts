import { z } from 'zod';
import { HIGHLIGHT_COLORS } from './store/annotations';

/* What the reader's API accepts, validated and capped. Positions are fractions of the page. */

const frac = z.number().min(0).max(1);
const rect = z.object({ x: frac, y: frac, w: frac, h: frac });
const page = z.number().int().min(1).max(100_000);
const note = z.string().max(5000).nullable().optional().transform((v) => (v?.trim() ? v.trim() : null));

export const newHighlightBody = z.object({
  kind: z.literal('highlight'),
  page,
  quote: z.string().trim().min(1).max(4000),
  prefix: z.string().max(200).default(''),
  suffix: z.string().max(200).default(''),
  rects: z.array(rect).min(1).max(200),
  color: z.enum(HIGHLIGHT_COLORS).default('yellow'),
  note,
  pdfKey: z.string().max(120).nullable().default(null),
});

export const newPageNoteBody = z.object({ kind: z.literal('note'), page, x: frac, y: frac, text: z.string().trim().min(1, 'Write something first.').max(5000) });

export const newAnnotationBody = z.discriminatedUnion('kind', [newHighlightBody, newPageNoteBody]);

export const changeAnnotationBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('highlight'),
    id: z.string().max(80),
    color: z.enum(HIGHLIGHT_COLORS).optional(),
    note: z.string().max(5000).nullable().optional().transform((v) => (v === undefined ? undefined : v?.trim() ? v.trim() : null)),
    page: page.optional(),
    rects: z.array(rect).min(1).max(200).optional(),
    pdfKey: z.string().max(120).nullable().optional(),
  }),
  z.object({ kind: z.literal('note'), id: z.string().max(80), text: z.string().trim().min(1).max(5000).optional(), x: frac.optional(), y: frac.optional() }),
]);
