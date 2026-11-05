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

export function downloadWord(result: Result, style: string, mode: Mode, annotations: Record<string, string>, o: DocOptions) {
  const { rd, html: h } = html(result, style, mode, annotations);
  const model = buildModel(h, o.contents, rd.effectiveMode === 'footnotes');
  const bytes = buildDocx(model, o);
  saveBlob(bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${slug(o.title || 'manuscript')}.docx`);
}

export async function downloadPdf(result: Result, style: string, mode: Mode, annotations: Record<string, string>, o: DocOptions) {
  const { html: h } = html(result, style, mode, annotations);
  const model = buildModel(h, o.contents, false);
  const bytes = await buildPdf(model, o);
  saveBlob(bytes, 'application/pdf', `${slug(o.title || 'manuscript')}.pdf`);
}
