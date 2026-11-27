/* Word and PDF downloads for a traced result. */
import { buildModel, saveBlob, slug, type DocOptions } from './docmodel';
import { buildDocx } from './docx';
import { render } from './engine';
import { buildPdf } from './pdf';
import type { Mode, Result } from './types';

function html(result: Result, style: string, mode: Mode, annotations: Record<string, string>) {
  const rd = render(result, style, mode, annotations);
  return { rd, html: rd.docHtml };
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* The Word file itself (for a download, or for saving to a connected app). */
export function wordFile(result: Result, style: string, mode: Mode, annotations: Record<string, string>, o: DocOptions) {
  const { rd, html: h } = html(result, style, mode, annotations);
  const model = buildModel(h, o.contents, rd.effectiveMode === 'footnotes');
  return { bytes: buildDocx(model, o), name: `${slug(o.title || 'manuscript')}.docx` };
}

export function downloadWord(result: Result, style: string, mode: Mode, annotations: Record<string, string>, o: DocOptions) {
  const { bytes, name } = wordFile(result, style, mode, annotations, o);
  saveBlob(bytes, DOCX_MIME, name);
}

export async function downloadPdf(result: Result, style: string, mode: Mode, annotations: Record<string, string>, o: DocOptions) {
  const { html: h } = html(result, style, mode, annotations);
  const model = buildModel(h, o.contents, false);
  const bytes = await buildPdf(model, o);
  saveBlob(bytes, 'application/pdf', `${slug(o.title || 'manuscript')}.pdf`);
}
