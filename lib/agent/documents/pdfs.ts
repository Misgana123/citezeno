/* Merging PDFs and taking pages out of one (pdf-lib, on the server). Pages are
   copied as they are; nothing in the PDFs is run. Password-protected PDFs are
   refused with a message the user can act on. */

export class PdfEditError extends Error {}

const PAGES_MAX = 2000;

/* "1-3, 5, 8-" → [1, 2, 3, 5, 8, …, pageCount] (1-based, in the order given, no repeats). */
export function parsePages(spec: string, pageCount: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const part of spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3])) throw new PdfEditError(`"${part}" isn’t a page or a range like 2-5.`);
    const from = Number(m[1] ?? 1);
    const to = m[2] ? Number(m[3] ?? pageCount) : from;
    if (from < 1 || to < from) throw new PdfEditError(`"${part}" isn’t a valid page range.`);
    if (to > pageCount) throw new PdfEditError(`The PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}; "${part}" goes past the end.`);
    for (let p = from; p <= to; p++) if (!seen.has(p)) seen.add(p) && out.push(p);
  }
  if (!out.length) throw new PdfEditError('Say which pages to take, e.g. "1-3, 5".');
  return out;
}

async function load(bytes: Uint8Array, name: string) {
  const { PDFDocument } = await import('pdf-lib');
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (/encrypt/i.test(msg)) throw new PdfEditError(`"${name}" is password-protected, so its pages can’t be copied.`);
    throw new PdfEditError(`"${name}" couldn’t be read as a PDF.`);
  }
}

/* One PDF of all the inputs' pages, in order. */
export async function mergePdfs(inputs: { name: string; bytes: Uint8Array }[], title?: string): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const input of inputs) {
    const doc = await load(input.bytes, input.name);
    if (out.getPageCount() + doc.getPageCount() > PAGES_MAX) throw new PdfEditError(`The merged PDF would be over ${PAGES_MAX} pages.`);
    for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
  }
  if (title) out.setTitle(title);
  out.setProducer('Citezeno');
  return { bytes: await out.save(), pageCount: out.getPageCount() };
}

/* A new PDF of some of a PDF's pages ("1-3, 5"). */
export async function pickPages(input: { name: string; bytes: Uint8Array }, pages: string): Promise<{ bytes: Uint8Array; pageCount: number; pages: number[] }> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await load(input.bytes, input.name);
  const chosen = parsePages(pages, doc.getPageCount());
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(
    doc,
    chosen.map((p) => p - 1),
  ))
    out.addPage(page);
  out.setProducer('Citezeno');
  return { bytes: await out.save(), pageCount: out.getPageCount(), pages: chosen };
}

export async function pageCount(input: { name: string; bytes: Uint8Array }): Promise<number> {
  return (await load(input.bytes, input.name)).getPageCount();
}
