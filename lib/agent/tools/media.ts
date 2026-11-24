import { z } from 'zod';
import type { Attachment } from '@/lib/providers/chat/types';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { chartInput } from '../documents/chart';
import { IMAGE_FORMATS, IMAGE_MIME, ImageEditError, imageOperation } from '../documents/image';
import { defineTool } from './types';

/* Charts and pictures: a chart drawn from numbers, and edits to a picture the
   user attached or the assistant made. Both are saved with the chat as PNG,
   JPEG or WebP; their fileId can go into a document. */

const KIND_LABEL: Record<z.infer<typeof chartInput>['kind'], string> = {
  bar: 'bar chart',
  horizontal_bar: 'bar chart',
  line: 'line chart',
  area: 'area chart',
  pie: 'pie chart',
  scatter: 'scatter chart',
};

export const createChart = defineTool({
  name: 'create_chart',
  description:
    'Draw a chart as a PNG picture from numbers: bar, horizontal_bar, line, area, pie or scatter, with one or more series. Use only numbers from tool results or the user. The chat shows it; its fileId can go into create_docx or create_pdf as an image block.',
  input: chartInput,
  kind: 'write',
  step: 'make',
  label: (i) => `Drawing a ${KIND_LABEL[i.kind]}${i.title ? ` “${i.title}”` : ''}`,
  done: (i) => ({ did: `Drew a ${KIND_LABEL[i.kind]}`, ...(i.title ? { about: i.title } : {}) }),
  async run(ctx, i) {
    const { chartPng } = await import('../documents/chart');
    const file = await ctx.files.save({ name: i.filename, mime: 'image/png', bytes: await chartPng(i) });
    return { result: { fileId: file.id, fileName: file.name }, display: { file, summary: 'Chart ready' } };
  },
});

/* The picture to edit: one the assistant made (by fileId), or one the user attached to this chat (by name). */
async function source(ctx: AgentContext, s: { fileId?: string; attachment?: string }): Promise<{ name: string; bytes: Uint8Array }> {
  if (s.fileId) {
    const got = await ctx.files.read(s.fileId);
    if (!got || !got.file.mime.startsWith('image/')) throw new ShelfError('not_found', `There is no picture with fileId "${s.fileId}" in this chat.`);
    return { name: got.file.name, bytes: got.bytes };
  }
  const images = (await ctx.chatAttachments()).filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image');
  // the latest one with that name, if the user attached it more than once
  const hit = images.findLast((a) => a.name === s.attachment);
  if (!hit) throw new ShelfError('not_found', `No picture called "${s.attachment}" was attached to this chat.${images.length ? ` Attached pictures: ${images.map((a) => a.name).join(', ')}.` : ''}`);
  return { name: hit.name, bytes: Uint8Array.from(Buffer.from(hit.data, 'base64')) };
}

export const editImageTool = defineTool({
  name: 'edit_image',
  description:
    'Edit a picture: resize, crop, rotate, flip or make it grayscale (operations run in order), then save it as PNG, JPEG or WebP (also to convert or compress it). The picture is one the user attached to this chat (by its name) or one the assistant made (by fileId).',
  input: z
    .object({
      fileId: z.string().min(1).max(80).optional().describe('A picture the assistant made in this chat.'),
      attachment: z.string().min(1).max(200).optional().describe('The name of a picture the user attached to this chat.'),
      filename: z.string().trim().min(1).max(120).describe('The new file’s name, without the extension.'),
      operations: z.array(imageOperation).max(10).default([]),
      format: z.enum(IMAGE_FORMATS).optional().describe('png (default), jpeg or webp.'),
      quality: z.number().int().min(30).max(100).optional().describe('For jpeg and webp (default 85).'),
    })
    .refine((i) => !!i.fileId !== !!i.attachment, 'Give either fileId or attachment.'),
  kind: 'write',
  step: 'make',
  label: (i) => `Editing ${i.attachment ?? 'a picture'}`,
  done: (i) => ({ did: 'Edited a picture', ...(i.attachment ? { about: i.attachment } : {}) }),
  async run(ctx, i) {
    const src = await source(ctx, i);
    const format = i.format ?? 'png';
    const { editImage } = await import('../documents/image');
    const out = await editImage(src.bytes, i.operations, { format, quality: i.quality }).catch((e) => {
      throw e instanceof ImageEditError ? new ShelfError('invalid_file', e.message) : e;
    });
    const file = await ctx.files.save({ name: i.filename, mime: IMAGE_MIME[format], bytes: out.bytes });
    return { result: { fileId: file.id, fileName: file.name, width: out.width, height: out.height, sizeBytes: file.size }, display: { file, summary: `${out.width}×${out.height}` } };
  },
});

export const MEDIA_TOOLS = [createChart, editImageTool];
