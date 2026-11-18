import { deflateSync } from 'node:zlib';

/* Tiny PDFs built by hand for the reader and upload tests. */

type Obj = { dict: string; stream?: Buffer };

export function buildPdf(objs: Obj[], trailer: { root: number; info?: number }): Uint8Array {
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  objs.forEach((o, i) => {
    parts.push(Buffer.from(`${i + 1} 0 obj\n`, 'latin1'));
    if (o.stream) {
      parts.push(Buffer.from(`${o.dict.replace(/>>\s*$/, '')} /Length ${o.stream.length} >>\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\n', 'latin1'));
    } else parts.push(Buffer.from(`${o.dict}\n`, 'latin1'));
    parts.push(Buffer.from('endobj\n', 'latin1'));
  });
  parts.push(Buffer.from(`trailer\n<< /Size ${objs.length + 1} /Root ${trailer.root} 0 R${trailer.info ? ` /Info ${trailer.info} 0 R` : ''} >>\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

/* A two-page paper: a title and DOI on page one (a CID font with a ToUnicode
   table, compressed), more text on page two, an Info title and a DOI link. */
export function paperPdf(opts: { doi?: string; infoTitle?: string; link?: string } = {}): Uint8Array {
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .:/-';
  const code = (s: string) => [...s].map((c) => (glyphs.indexOf(c) + 1).toString(16).padStart(4, '0')).join('');
  const cmap = `/CIDInit /ProcSet findresource begin\nbegincmap\n1 begincodespacerange <0000> <ffff> endcodespacerange\n${glyphs.length} beginbfchar\n${[...glyphs].map((c, i) => `<${(i + 1).toString(16).padStart(4, '0')}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar\nendcmap\nend\n`;
  const page1 = `BT /F1 18 Tf 72 720 Td <${code('Rivers and floods in a changing climate')}> Tj 0 -30 Td /F2 10 Tf (A. Writer and B. Author) Tj 0 -20 Td <${code(`doi: ${opts.doi ?? '10.5555/rivers.2020'}`)}> Tj ET`;
  const page2 = 'BT /F2 11 Tf 72 720 Td (Methods. We measured the rivers every spring for twenty years and compared the floods.) Tj T* [(Results) -300 (show) -300 (more) -300 (floods.)] TJ ET';
  const objs: Obj[] = [
    { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
    { dict: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>' },
    { dict: `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 7 0 R /F2 9 0 R >> >> /Contents 5 0 R${opts.link ? ' /Annots [10 0 R]' : ''} >>` },
    { dict: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F2 9 0 R >> >> /Contents [6 0 R] >>' },
    { dict: '<< /Filter /FlateDecode >>', stream: deflateSync(Buffer.from(page1, 'latin1')) },
    { dict: '<< >>', stream: Buffer.from(page2, 'latin1') },
    { dict: '<< /Type /Font /Subtype /Type0 /BaseFont /Fake /Encoding /Identity-H /ToUnicode 8 0 R >>' },
    { dict: '<< /Filter /FlateDecode >>', stream: deflateSync(Buffer.from(cmap, 'latin1')) },
    { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
    { dict: `<< /Type /Annot /Subtype /Link /A << /S /URI /URI (${opts.link ?? ''}) >> >>` },
    { dict: `<< /Title (${opts.infoTitle ?? ''}) /Producer (test) >>` },
  ];
  return buildPdf(objs, { root: 1, info: opts.infoTitle ? 11 : undefined });
}

/* A one-page scan: an image and no text. */
export function scannedPdf(): Uint8Array {
  return buildPdf(
    [
      { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      { dict: '<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>' },
      { dict: '<< >>', stream: Buffer.from('q 600 0 0 800 0 0 cm /Im1 Do Q', 'latin1') },
      { dict: '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray /Filter /DCTDecode >>', stream: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    ],
    { root: 1 },
  );
}
