import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import { DOC_TEXT_MAX, documentInput, textLength } from '../../documents/blocks';
import { defineTool, tally } from '../types';
import { app, appLabel, clip, SHEET_ROWS } from './shared';

/* Google Docs and Sheets: read them, add rows, make new ones. */

const FILE_ID = z.string().trim().min(1).max(200);
const CELL = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);
const ROWS = z.array(z.array(CELL).max(50)).min(1).max(2000);

export const cloudDocCreate = defineTool({
  name: 'cloud_doc_create',
  description:
    'Make an editable Google Doc in the user’s connected Drive, from the same content blocks as create_docx (heading, paragraph, bullets, numbered, quote, table, image by fileId, references, page_break; **bold**, *italic*, [links](https://…)). Write the full content; never invent sources. Asks the user first.',
  input: z.object(documentInput),
  kind: 'write',
  step: 'make',
  needs: 'documents',
  label: (i) => `Making a Google Doc “${clip(i.filename, 60)}”`,
  done: (i) => ({ did: 'Made a Google Doc', about: i.filename }),
  confirm: (i, ctx) => `Make a Google Doc “${i.filename}” in your ${appLabel(ctx, 'documents', 'Drive')}?`,
  async run(ctx, i) {
    if (textLength(i.blocks) > DOC_TEXT_MAX) throw new ShelfError('too_large', 'The document is too long. Split it into parts.');
    const pictures = new Map<string, never>();
    if (i.blocks.some((b) => b.type === 'image')) throw new ShelfError('bad_request', 'Pictures can’t go straight into a Google Doc yet: make it with create_docx, then save it with cloud_file_save (convert: true).');
    const { buildDocx } = await import('../../documents/docx');
    const bytes = await buildDocx({ title: i.title, author: i.author, blocks: i.blocks, pictures });
    const { api, label } = await app(ctx, 'documents');
    const doc = await api.createFromDocx({ title: i.filename, bytes });
    return { result: { made: doc.name, url: doc.url, app: label }, display: { ...(doc.url ? { links: [{ title: doc.name, url: doc.url }] } : {}), summary: 'Google Doc ready' } };
  },
});

export const cloudSheetRead = defineTool({
  name: 'cloud_sheet_read',
  description: `Read a Google Sheet from the user’s connected Drive by fileId: one sheet (default the first) and an optional A1 range like "A1:F200". At most ${SHEET_ROWS} rows; also lists the sheet names.`,
  input: z.object({ fileId: FILE_ID, sheet: z.string().max(100).optional(), range: z.string().regex(/^[A-Z]{1,3}\d{0,7}(:[A-Z]{1,3}\d{0,7})?$/).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'sheets',
  label: () => 'Reading a Google Sheet',
  done: (i) => ({ did: 'Read a Google Sheet', ...(i.sheet ? { about: i.sheet } : {}) }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'sheets');
    const r = await api.read(i.fileId, { sheet: i.sheet, range: i.range, maxRows: SHEET_ROWS });
    return { result: r, display: { ...(r.url ? { links: [{ title: r.title, url: r.url }] } : {}), summary: tally(r.rows.length, 'row') } };
  },
});

export const cloudSheetAppend = defineTool({
  name: 'cloud_sheet_append',
  description: 'Add rows to the end of a Google Sheet in the user’s connected Drive (fileId; default the first sheet). Values are kept exactly as given (text starting with "=" stays text). Asks the user first.',
  input: z.object({ fileId: FILE_ID, sheet: z.string().max(100).optional(), rows: ROWS }),
  kind: 'write',
  step: 'change',
  needs: 'sheets',
  label: () => 'Adding rows to a Google Sheet',
  done: (i) => ({ did: 'Added rows to a Google Sheet', ...(i.rows?.length ? { about: tally(i.rows.length, 'row').toLowerCase() } : {}) }),
  confirm: (i) => `Add ${tally(i.rows.length, 'row').toLowerCase()} to this Google Sheet${i.sheet ? ` (sheet “${i.sheet}”)` : ''}?`,
  async run(ctx, i) {
    const { api } = await app(ctx, 'sheets');
    const r = await api.append(i.fileId, i.rows, { sheet: i.sheet });
    return { result: r, display: { ...(r.url ? { links: [{ title: 'The spreadsheet', url: r.url }] } : {}), summary: `${tally(r.appended, 'row')} added` } };
  },
});

export const cloudSheetCreate = defineTool({
  name: 'cloud_sheet_create',
  description: 'Make a new Google Sheet in the user’s connected Drive: a title and one or more sheets, each a list of rows (the first row as headers). Numbers stay numbers. Asks the user first.',
  input: z.object({ title: z.string().trim().min(1).max(200), sheets: z.array(z.object({ name: z.string().trim().min(1).max(100), rows: ROWS })).min(1).max(10) }),
  kind: 'write',
  step: 'make',
  needs: 'sheets',
  label: (i) => `Making a Google Sheet “${clip(i.title, 60)}”`,
  done: (i) => ({ did: 'Made a Google Sheet', about: i.title }),
  confirm: (i, ctx) => `Make a Google Sheet “${i.title}” in your ${appLabel(ctx, 'sheets', 'Drive')}?`,
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'sheets');
    const f = await api.create(i);
    return { result: { made: f.name, url: f.url, app: label }, display: { ...(f.url ? { links: [{ title: f.name, url: f.url }] } : {}), summary: 'Google Sheet ready' } };
  },
});

export const OFFICE_TOOLS = [cloudDocCreate, cloudSheetRead, cloudSheetAppend, cloudSheetCreate];
