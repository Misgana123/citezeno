import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { DOC_TEXT_MAX, documentInput, pictureInfo, textLength, type DocBlock } from '../documents/blocks';
import { deckInput, slideProblems } from '../documents/slides';
import { workbookInput, workbookProblems } from '../documents/sheets';
import type { LoadedPicture } from '../documents/docx';
import { defineTool } from './types';

/* Making files the user can download: a Word file or a PDF from the same
   content blocks, a PowerPoint deck, an Excel workbook. Built on our server
   and kept with the chat (agent files). */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PICTURES_MAX = 20;

const input = z.object(documentInput);
type DocumentInput = z.infer<typeof input>;

const BLOCKS_HELP =
  'Blocks: heading (level 1–3), paragraph, bullets, numbered, quote, table (headers + rows), image (a chart or picture made in this chat, by fileId), references (items exactly as tools returned them), page_break. Text may use **bold**, *italic* and [links](https://…). Write the full content; never invent sources.';

/* The pictures a file uses, read from this user's agent files. */
async function loadPictures(ctx: AgentContext, fileIds: string[]): Promise<Map<string, LoadedPicture>> {
  const ids = [...new Set(fileIds)];
  if (ids.length > PICTURES_MAX) throw new ShelfError('bad_request', `A document can hold at most ${PICTURES_MAX} pictures.`);
  const out = new Map<string, LoadedPicture>();
  for (const id of ids) {
    const got = await ctx.files.read(id);
    const info = got && pictureInfo(got.bytes);
    if (!got || !info) throw new ShelfError('bad_request', `There is no picture with fileId "${id}" in this chat (only PNG or JPEG pictures the assistant made can be added).`);
    out.set(id, { ...info, bytes: got.bytes });
  }
  return out;
}

const blockPictures = (blocks: DocBlock[]) => blocks.flatMap((b) => (b.type === 'image' ? [b.fileId] : []));

function checkSize(i: DocumentInput) {
  if (textLength(i.blocks) > DOC_TEXT_MAX) throw new ShelfError('too_large', `The document is too long (over ${DOC_TEXT_MAX.toLocaleString('en-US')} characters). Split it into parts.`);
}

export const createDocx = defineTool({
  name: 'create_docx',
  description: `Make a Word document (.docx) the user can download, e.g. a report, a literature review or notes. ${BLOCKS_HELP}`,
  input,
  kind: 'write',
  step: 'make',
  label: (i) => `Making a Word document “${i.filename}”`,
  done: (i) => ({ did: 'Made a Word document', about: i.filename }),
  async run(ctx, i) {
    checkSize(i);
    const pictures = await loadPictures(ctx, blockPictures(i.blocks));
    const { buildDocx } = await import('../documents/docx');
    const file = await ctx.files.save({ name: i.filename, mime: DOCX_MIME, bytes: await buildDocx({ title: i.title, author: i.author, blocks: i.blocks, pictures }) });
    return { result: { fileId: file.id, fileName: file.name, sizeBytes: file.size, blocks: i.blocks.length }, display: { file, summary: 'Word document ready' } };
  },
});

export const createPdf = defineTool({
  name: 'create_pdf',
  description: `Make a PDF the user can download, e.g. a report or a handout. ${BLOCKS_HELP} The PDF font covers Latin, Greek and Cyrillic text; for other scripts make a Word document instead.`,
  input,
  kind: 'write',
  step: 'make',
  label: (i) => `Making a PDF “${i.filename}”`,
  done: (i) => ({ did: 'Made a PDF', about: i.filename }),
  async run(ctx, i) {
    checkSize(i);
    const pictures = await loadPictures(ctx, blockPictures(i.blocks));
    const { buildPdf } = await import('../documents/pdf');
    const file = await ctx.files.save({ name: i.filename, mime: PDF_MIME, bytes: await buildPdf({ title: i.title, author: i.author, blocks: i.blocks, pictures }) });
    return { result: { fileId: file.id, fileName: file.name, sizeBytes: file.size, blocks: i.blocks.length }, display: { file, summary: 'PDF ready' } };
  },
});

export const createPptx = defineTool({
  name: 'create_pptx',
  description:
    'Make a PowerPoint deck (.pptx) the user can download. Each slide has a title and at most two of: bullets (short points), a table, an image (a chart or picture made in this chat, by fileId) or a native chart from numbers. A slide with only a title and subtitle is a title slide. Add speaker notes when useful. Never invent sources or numbers.',
  input: z.object(deckInput),
  kind: 'write',
  step: 'make',
  label: (i) => `Making slides “${i.filename}”`,
  done: (i) => ({ did: 'Made slides', about: i.filename }),
  async run(ctx, i) {
    const problem = slideProblems(i.slides);
    if (problem) throw new ShelfError('bad_request', problem);
    const pictures = await loadPictures(
      ctx,
      i.slides.flatMap((s) => (s.image ? [s.image.fileId] : [])),
    );
    const { buildPptx } = await import('../documents/slides');
    const file = await ctx.files.save({ name: i.filename, mime: PPTX_MIME, bytes: await buildPptx({ title: i.title, author: i.author, slides: i.slides, pictures }) });
    return {
      result: { fileId: file.id, fileName: file.name, sizeBytes: file.size, slides: i.slides.length },
      display: { file, summary: `${i.slides.length} slide${i.slides.length === 1 ? '' : 's'}` },
    };
  },
});

export const createXlsx = defineTool({
  name: 'create_xlsx',
  description:
    'Make an Excel workbook (.xlsx) the user can download: one or more sheets with a header row and rows of cells (text, numbers, true/false, null, { "formula": "SUM(B2:B9)" } or { "date": "2024-05-01" }). Numbers stay numbers. Charts or pictures made in this chat can be placed at a cell. Use only data from tool results or the user.',
  input: z.object(workbookInput),
  kind: 'write',
  step: 'make',
  label: (i) => `Making a spreadsheet “${i.filename}”`,
  done: (i) => ({ did: 'Made a spreadsheet', about: i.filename }),
  async run(ctx, i) {
    const problem = workbookProblems(i.sheets);
    if (problem) throw new ShelfError('bad_request', problem);
    const pictures = await loadPictures(
      ctx,
      i.sheets.flatMap((s) => (s.images ?? []).map((im) => im.fileId)),
    );
    const { buildXlsx } = await import('../documents/sheets');
    const file = await ctx.files.save({ name: i.filename, mime: XLSX_MIME, bytes: await buildXlsx({ sheets: i.sheets, pictures }) });
    const rows = i.sheets.reduce((n, s) => n + s.rows.length, 0);
    return {
      result: { fileId: file.id, fileName: file.name, sizeBytes: file.size, sheets: i.sheets.length, rows },
      display: { file, summary: `${i.sheets.length} sheet${i.sheets.length === 1 ? '' : 's'}, ${rows.toLocaleString('en-US')} rows` },
    };
  },
});

export const DOCUMENT_TOOLS = [createDocx, createPdf, createPptx, createXlsx];
