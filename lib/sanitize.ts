/* Shared traces are stored from the browser, so their rendered HTML is treated
   as untrusted before it is shown to other people. The renderer only emits a
   small set of tags with double-quoted attributes; anything else is dropped. */

const TAGS = new Set(['p', 'i', 'em', 'b', 'strong', 'a', 'sup', 'sub', 'span', 'div', 'h3', 'br', 'small']);
const ATTRS = new Set(['class', 'href', 'id', 'title']);
const SAFE_HREF = /^(https?:|mailto:|#)/i;

export function sanitizeRendered(html: string) {
  return html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (_m, close: string, tag: string, rest: string) => {
    const t = tag.toLowerCase();
    if (!TAGS.has(t)) return '';
    if (close) return `</${t}>`;
    const kept: string[] = [];
    for (const [, name, value] of rest.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      const n = name.toLowerCase();
      if (!ATTRS.has(n)) continue;
      if (n === 'href' && !SAFE_HREF.test(value.replace(/&amp;/g, '&').trim())) continue;
      kept.push(`${n}="${value}"`);
    }
    if (t === 'a') kept.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
    return `<${t}${kept.length ? ' ' + kept.join(' ') : ''}>`;
  });
}
