import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { AGENT_FILE_MAX_BYTES, type AgentFileRef } from '../files';
import { baseName, inputRef, mimeFor } from './code';
import { defineTool, tally } from './types';

/* Several files in one ZIP to download: files made in this chat, PDFs from
   the shelf, and files the user attached (pictures as they are; other
   attachments as the text their browser read, so as .txt). And a ZIP made in
   this chat (e.g. one run_python downloaded) opened into its files. */

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

/* Opening a ZIP: at most this many files, and this much in all once unpacked (a small ZIP can unpack to gigabytes). */
const UNZIP_FILES_MAX = 50;
const UNZIP_TOTAL_MAX = 100 * 1024 * 1024;

const tooBig = (what: string) => new ShelfError('too_large', `${what} The ZIP can’t be opened here; ask for the files you need with run_python instead.`);

export const unzipFile = defineTool({
  name: 'unzip_file',
  description: `Open a ZIP made in this chat (fileId, e.g. one run_python downloaded or zip_files made) and keep its files as files of the chat, each with its own fileId for the other tools. Folders inside are flattened; names stay unique. At most ${UNZIP_FILES_MAX} files.`,
  input: z.object({
    fileId: z.string().min(1).max(80),
    only: z.array(z.string().trim().min(1).max(300)).max(UNZIP_FILES_MAX).optional().describe('Only these files (names or paths inside the ZIP); default every file.'),
  }),
  kind: 'write',
  step: 'make',
  label: () => 'Opening a ZIP',
  done: () => ({ did: 'Opened a ZIP' }),
  async run(ctx, i) {
    const got = await ctx.files.read(i.fileId);
    if (!got) throw new ShelfError('not_found', `There is no file with fileId "${i.fileId}" in this chat.`);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(got.bytes).catch(() => {
      throw new ShelfError('invalid_file', `"${got.file.name}" isn’t a ZIP file that can be opened.`);
    });
    // files only: no folders, and none of the system files Macs add
    const all = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX\/|\.DS_Store$)/.test(f.name));
    const wanted = i.only?.length ? all.filter((f) => i.only!.some((n) => f.name === n || baseName(f.name) === n)) : all;
    if (!wanted.length) throw new ShelfError('not_found', i.only?.length ? `None of those files are in "${got.file.name}". It holds: ${all.slice(0, 30).map((f) => f.name).join(', ')}.` : `"${got.file.name}" is empty.`);
    if (wanted.length > UNZIP_FILES_MAX) throw tooBig(`It holds ${wanted.length} files (at most ${UNZIP_FILES_MAX}); name the ones you need with only.`);
    // the sizes the ZIP declares, checked before anything is unpacked; the real sizes are checked again as each file comes out
    const declared = wanted.reduce((n, f) => n + Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
    if (declared > UNZIP_TOTAL_MAX) throw tooBig('It unpacks to more than 100 MB.');

    const used = new Set<string>();
    const saved: { fileId: string; fileName: string; path: string; sizeBytes: number }[] = [];
    const refs: AgentFileRef[] = [];
    let total = 0;
    for (const f of wanted) {
      const bytes = await f.async('uint8array');
      total += bytes.byteLength;
      if (total > UNZIP_TOTAL_MAX) throw tooBig('It unpacks to more than 100 MB.');
      if (bytes.byteLength > AGENT_FILE_MAX_BYTES) throw tooBig(`"${f.name}" is too large on its own.`);
      let name = baseName(f.name);
      for (let n = 2; used.has(name.toLowerCase()); n++) name = baseName(f.name).replace(/(\.[^.]*)?$/, ` (${n})$1`);
      used.add(name.toLowerCase());
      const file = await ctx.files.save({ name, mime: mimeFor(name), bytes });
      refs.push(file);
      saved.push({ fileId: file.id, fileName: file.name, path: f.name, sizeBytes: file.size });
    }
    return { result: { files: saved, ...(all.length > wanted.length ? { leftInZip: all.length - wanted.length } : {}) }, display: { files: refs, summary: tally(saved.length, 'file') } };
  },
});

export const ZIP_TOOLS = [zipFiles, unzipFile];
