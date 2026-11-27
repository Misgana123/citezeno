import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { AGENT_FILE_MAX_BYTES } from '../files';
import { baseName, inputRef } from './code';
import { defineTool, tally } from './types';

/* Several files in one ZIP to download: files made in this chat, PDFs from
   the shelf, and files the user attached (pictures as they are; other
   attachments as the text their browser read, so as .txt). */

const FILES_MAX = 50;
const TEXT_NAME = /\.(txt|md|markdown|csv|tsv|json|tex|bib|ris|xml|html?)$/i;

type Entry = { name: string; bytes: Uint8Array };

async function collect(ctx: AgentContext, refs: z.infer<typeof inputRef>[]): Promise<Entry[]> {
  const out: Entry[] = [];
  const used = new Set<string>();
  const add = (name: string, bytes: Uint8Array) => {
    let path = baseName(name);
    for (let n = 2; used.has(path.toLowerCase()); n++) path = baseName(name).replace(/(\.[^.]*)?$/, ` (${n})$1`);
    used.add(path.toLowerCase());
    out.push({ name: path, bytes });
  };
  const attachments = refs.some((r) => r.attachment) ? await ctx.chatAttachments() : [];
  for (const r of refs) {
    if (r.fileId) {
      const got = await ctx.files.read(r.fileId);
      if (!got) throw new ShelfError('not_found', `There is no file with fileId "${r.fileId}" in this chat.`);
      add(got.file.name, got.bytes);
    } else if (r.pdfId) {
      const got = await ctx.files.readShelfPdf(r.pdfId);
      if (!got) throw new ShelfError('not_found', `There is no PDF with pdfId "${r.pdfId}" on your shelf.`);
      add(got.fileName, got.bytes);
    } else {
      const hit = attachments.findLast((a) => a.name === r.attachment);
      if (!hit) throw new ShelfError('not_found', `No file called "${r.attachment}" was attached to this chat.`);
      if (hit.kind === 'image') add(hit.name, Uint8Array.from(Buffer.from(hit.data, 'base64')));
      else add(TEXT_NAME.test(hit.name) ? hit.name : `${hit.name.replace(/\.[^.]*$/, '')}.txt`, new TextEncoder().encode(hit.text));
    }
  }
  return out;
}

export const zipFiles = defineTool({
  name: 'zip_files',
  description: `Put several files into one ZIP for the user to download: files made in this chat (fileId), PDFs on the user’s shelf (pdfId) or files the user attached (attachment; only pictures keep their bytes, other attachments go in as their text, .txt). At most ${FILES_MAX} files.`,
  input: z.object({ files: z.array(inputRef).min(1).max(FILES_MAX), filename: z.string().trim().min(1).max(120).describe('The ZIP’s name, without the extension.') }),
  kind: 'write',
  step: 'make',
  label: (i) => `Zipping ${tally(i.files.length, 'file')}`,
  done: (i) => ({ did: 'Zipped', about: tally(i.files.length, 'file') }),
  async run(ctx, i) {
    const entries = await collect(ctx, i.files);
    const total = entries.reduce((n, e) => n + e.bytes.byteLength, 0);
    if (total > AGENT_FILE_MAX_BYTES * 2) throw new ShelfError('too_large', 'These files are too large to zip together. Pick fewer.');
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const e of entries) zip.file(e.name, e.bytes);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const file = await ctx.files.save({ name: `${i.filename.replace(/\.zip$/i, '')}.zip`, mime: 'application/zip', bytes });
    return { result: { fileId: file.id, fileName: file.name, files: entries.map((e) => e.name), sizeBytes: file.size }, display: { file, summary: tally(entries.length, 'file') } };
  },
});

export const ZIP_TOOLS = [zipFiles];
