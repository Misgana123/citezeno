import { parseBibtex } from './bibtex';
import { parseRis } from './ris';
import type { ParsedFile } from './types';

/* A reference file's text → entries. The format comes from the name, or the content. */
export function parseReferenceFile(fileName: string, text: string): ParsedFile | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.ris') || (!name.endsWith('.bib') && /^\s*TY\s{1,2}-/m.test(text))) return parseRis(text);
  if (name.endsWith('.bib') || name.endsWith('.bibtex') || /@\s*[a-z]+\s*[{(]/i.test(text)) return parseBibtex(text);
  return null;
}
