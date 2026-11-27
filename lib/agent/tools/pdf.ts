import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import type { AgentContext } from '../context';
import { PdfEditError } from '../documents/pdfs';
import { defineTool } from './types';

/* Working with PDFs: merge several, take some pages out as a new PDF, or read
   the text of some pages. A PDF is one the user keeps on their shelf (its
   pdfId, from get_library_item) or one the assistant made in this chat (its
   fileId). The results are saved with the chat. */

const PDF_MIME = 'application/pdf';
export const PDF_TEXT_CHARS = 15_000;

const pdfRef = z
  .object({
    pdfId: z.string().min(1).max(80).optional().describe('A PDF on the user’s shelf (from get_library_item).'),
    fileId: z.string().min(1).max(80).optional().describe('A PDF the assistant made in this chat.'),
  })
  .refine((r) => !!r.pdfId !== !!r.fileId, 'Give either pdfId or fileId.');
type PdfRef = z.infer<typeof pdfRef>;

async function readPdf(ctx: AgentContext, ref: PdfRef): Promise<{ name: string; bytes: Uint8Array }> {
  if (ref.pdfId) {
    const got = await ctx.files.readShelfPdf(ref.pdfId);
    if (!got) throw new ShelfError('not_found', `There is no PDF with pdfId "${ref.pdfId}" on your shelf.`);
    return { name: got.fileName, bytes: got.bytes };
  }
  const got = await ctx.files.read(ref.fileId!);
  if (!got || got.file.mime !== PDF_MIME) throw new ShelfError('not_found', `There is no PDF with fileId "${ref.fileId}" in this chat.`);
  return { name: got.file.name, bytes: got.bytes };
}

const friendly = <T>(work: Promise<T>) =>
  work.catch((e) => {
    throw e instanceof PdfEditError ? new ShelfError('invalid_file', e.message) : e;
  });

export const pdfMerge = defineTool({
  name: 'pdf_merge',
  description: 'Merge 2 to 20 PDFs (shelf PDFs by pdfId, or PDFs made in this chat by fileId) into one PDF, in the order given.',
  input: z.object({ filename: z.string().trim().min(1).max(120).describe('Without the extension.'), inputs: z.array(pdfRef).min(2).max(20), title: z.string().max(300).optional() }),
  kind: 'write',
  step: 'make',
  label: (i) => `Merging ${i.inputs.length} PDFs`,
  done: (i) => ({ did: `Merged ${i.inputs.length} PDFs`, about: i.filename }),
  async run(ctx, i) {
    const inputs: { name: string; bytes: Uint8Array }[] = [];
    for (const ref of i.inputs) inputs.push(await readPdf(ctx, ref));
    const { mergePdfs } = await import('../documents/pdfs');
    const merged = await friendly(mergePdfs(inputs, i.title));
    const file = await ctx.files.save({ name: i.filename, mime: PDF_MIME, bytes: merged.bytes });
    return { result: { fileId: file.id, fileName: file.name, pages: merged.pageCount, merged: inputs.map((x) => x.name) }, display: { file, summary: `${merged.pageCount} pages` } };
  },
});

export const pdfSplit = defineTool({
  name: 'pdf_split',
  description: 'Make a new PDF from some pages of a PDF (shelf PDF by pdfId, or one made in this chat by fileId). Pages like "1-3, 5" or "10-" (to the end).',
  input: z.object({ filename: z.string().trim().min(1).max(120).describe('Without the extension.'), pdf: pdfRef, pages: z.string().trim().min(1).max(200) }),
  kind: 'write',
  step: 'make',
  label: (i) => `Taking pages ${i.pages} from a PDF`,
  done: (i) => ({ did: 'Took pages from a PDF', about: `pages ${i.pages}` }),
  async run(ctx, i) {
    const src = await readPdf(ctx, i.pdf);
    const { pickPages } = await import('../documents/pdfs');
    const out = await friendly(pickPages(src, i.pages));
    const file = await ctx.files.save({ name: i.filename, mime: PDF_MIME, bytes: out.bytes });
    return { result: { fileId: file.id, fileName: file.name, pages: out.pageCount, from: src.name }, display: { file, summary: `${out.pageCount} page${out.pageCount === 1 ? '' : 's'}` } };
  },
});

export const pdfExtractText = defineTool({
  name: 'pdf_extract_text',
  description: `Read the text of a PDF (shelf PDF by pdfId, or one made in this chat by fileId), optionally only some pages ("1-3"). At most ${PDF_TEXT_CHARS.toLocaleString('en-US')} characters. For questions about a saved paper’s content, ask_paper is better.`,
  input: z.object({ pdf: pdfRef, pages: z.string().trim().max(200).optional() }),
  kind: 'read',
  step: 'read',
  label: (i) => (i.pages ? `Reading pages ${i.pages} of a PDF` : 'Reading a PDF'),
  done: (i) => ({ did: 'Read a PDF', ...(i.pages ? { about: `pages ${i.pages}` } : {}) }),
  async run(ctx, i) {
    const src = await readPdf(ctx, i.pdf);
    const { pageCount, pickPages } = await import('../documents/pdfs');
    const total = await friendly(pageCount(src));
    const bytes = i.pages ? (await friendly(pickPages(src, i.pages))).bytes : src.bytes;
    const { text } = await ctx.pdfText().read(bytes);
    const clean = text.trim();
    if (!clean) throw new ShelfError('invalid_file', 'Those pages have no readable text (the PDF may be scanned).');
    const cut = clean.length > PDF_TEXT_CHARS;
    return {
      result: { name: src.name, pageCount: total, ...(i.pages ? { pages: i.pages } : {}), text: cut ? clean.slice(0, PDF_TEXT_CHARS) : clean, ...(cut ? { cut: true, totalChars: clean.length } : {}) },
      display: { summary: `${clean.length.toLocaleString('en-US')} characters` },
    };
  },
});

export const PDF_TOOLS = [pdfMerge, pdfSplit, pdfExtractText];
