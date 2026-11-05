/* Read a draft from a .txt, .md or .docx file chosen by the user. */
import { unzipEntry } from './zip';

const MAX_BYTES = 15 * 1024 * 1024;

function fromMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '');
}

async function fromDocx(buf: ArrayBuffer) {
  const xml = await unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('That .docx has no document body.');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras: string[] = [];
  const ps = doc.getElementsByTagNameNS(W, 'p');
  for (let i = 0; i < ps.length; i++) {
    let t = '';
    const walk = (n: Element) => {
      for (let c = n.firstElementChild; c; c = c.nextElementSibling) {
        if (c.namespaceURI !== W) continue;
        if (c.localName === 't') t += c.textContent || '';
        else if (c.localName === 'tab') t += ' ';
        else if (c.localName === 'br') t += '\n';
        else if (c.localName === 'footnoteReference' || c.localName === 'endnoteReference') continue;
        else if (c.localName !== 'p') walk(c);
      }
    };
    walk(ps[i]);
    if (t.trim()) paras.push(t.trim());
  }
  return paras.join('\n\n');
}

export async function readDraftFile(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 15 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return fromDocx(await file.arrayBuffer());
  if (name.endsWith('.md') || name.endsWith('.markdown')) return fromMarkdown(await file.text());
  if (name.endsWith('.txt') || file.type.startsWith('text/')) return file.text();
  throw new Error('Open a .docx, .txt or .md file.');
}
