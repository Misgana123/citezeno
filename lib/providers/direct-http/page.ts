import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { WebPage } from '../web-files/types';
import type { RawPage } from './fetch';

/* A web page's main text, the way a reader view shows it: Readability picks
   the article out of menus, ads and footers; scripts and styles never run (the
   HTML is only parsed). Pages Readability can't read fall back to the body's text. */

const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'FIGCAPTION', 'DT', 'DD', 'TABLE', 'UL', 'OL']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'NAV', 'FOOTER', 'FORM']);

type DomNode = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<DomNode> };

/* Text with a blank line between blocks and one line per list item or table row. */
export function blockText(root: DomNode): string {
  const out: string[] = [];
  const walk = (n: DomNode) => {
    if (n.nodeType === 3) return void out.push((n.textContent ?? '').replace(/\s+/g, ' '));
    if (n.nodeType !== 1 || SKIP.has(n.nodeName.toUpperCase())) return;
    const name = n.nodeName.toUpperCase();
    if (name === 'BR') return void out.push('\n');
    if (name === 'LI') out.push('\n- ');
    for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    if (name === 'TD' || name === 'TH') out.push(' | ');
    if (BLOCKS.has(name)) out.push('\n\n');
  };
  walk(root);
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* linkedom leaves the body empty unless the HTML has its <html> element, so bare pages are wrapped. */
const parseDocument = (html: string) => parseHTML(/<html[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`).document;

export function readablePage(raw: RawPage): WebPage {
  if (/^text\/plain\b/i.test(raw.contentType))
    return {
      title: null,
      text: raw.body
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
      finalUrl: raw.finalUrl,
    };
  const document = parseDocument(raw.body);
  const title = document.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || null;
  let article: { title?: string | null; content?: string | null } | null = null;
  try {
    article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
  } catch {
    article = null;
  }
  if (article?.content) {
    const text = blockText(parseDocument(article.content).body as unknown as DomNode);
    if (text) return { title: article.title?.trim() || title, text, finalUrl: raw.finalUrl };
  }
  // Readability changes the document it reads, so the fallback parses the page again
  const body = parseDocument(raw.body).body as unknown as DomNode | null;
  return { title, text: body ? blockText(body) : '', finalUrl: raw.finalUrl };
}
