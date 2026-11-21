import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { DOC_TEXT_MAX, documentInput, pictureInfo, textLength, type DocBlock } from '../documents/blocks';
import type { LoadedPicture } from '../documents/docx';
import { defineTool } from './types';

/* Making documents the user can download: a Word file or a PDF, from the same
   content blocks. Built on our server and kept with the chat (agent files). */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const PICTURES_MAX = 20;

const input = z.object(documentInput);
type DocumentInput = z.infer<typeof input>;

const BLOCKS_HELP =
  'Blocks: heading (level 1–3), paragraph, bullets, numbered, quote, table (headers + rows), image (a chart or picture made in this chat, by fileId), references (items exactly as tools returned them), page_break. Text may use **bold**, *italic* and [links](https://…). Write the full content; never invent sources.';

/* The pictures the blocks use, read from this user's agent files. */
async function loadPictures(ctx: AgentContext, blocks: DocBlock[]): Promise<Map<string, LoadedPicture>> {
  const ids = [...new Set(blocks.flatMap((b) => (b.type === 'image' ? [b.fileId] : [])))];
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

function checkSize(i: DocumentInput) {
  if (textLength(i.blocks) > DOC_TEXT_MAX) throw new ShelfError('too_large', `The document is too long (over ${DOC_TEXT_MAX.toLocaleString('en-US')} characters). Split it into parts.`);
}

export const createDocx = defineTool({
  name: 'create_docx',
  description: `Make a Word document (.docx) the user can download, e.g. a report, a literature review or notes. ${BLOCKS_HELP}`,
  input,
  kind: 'write',
  label: (i) => `Making a Word document “${i.filename}”`,
  async run(ctx, i) {
    checkSize(i);
    const pictures = await loadPictures(ctx, i.blocks);
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
  label: (i) => `Making a PDF “${i.filename}”`,
  async run(ctx, i) {
    checkSize(i);
    const pictures = await loadPictures(ctx, i.blocks);
    const { buildPdf } = await import('../documents/pdf');
    const file = await ctx.files.save({ name: i.filename, mime: PDF_MIME, bytes: await buildPdf({ title: i.title, author: i.author, blocks: i.blocks, pictures }) });
    return { result: { fileId: file.id, fileName: file.name, sizeBytes: file.size, blocks: i.blocks.length }, display: { file, summary: 'PDF ready' } };
  },
});

export const DOCUMENT_TOOLS = [createDocx, createPdf];
