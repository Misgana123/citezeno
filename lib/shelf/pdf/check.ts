/* Is this really a PDF? The header must say so near the start, and a complete
   file ends with an end-of-file marker. A file merely named ".pdf" fails. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) return false;
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 8192))).toString('latin1');
  return /%PDF-\d\.\d/.test(head) && tail.includes('%%EOF');
}

/* A safe file name to show and to download as. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  const named = clean || 'paper.pdf';
  return /\.pdf$/i.test(named) ? named : `${named}.pdf`;
}
