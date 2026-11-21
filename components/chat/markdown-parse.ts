/* Reading the assistant's replies: paragraphs, bullet and numbered lists,
   **bold**, *italics*, `code`, [links](https://…) and bare https links. The
   result is plain data the page renders as React elements; only http(s)
   links become clickable. */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; text: string }
  /* [3]: the reply's paper number 3 */
  | { kind: 'cite'; n: number }
  /* [p3-2] or [p3-2, p4-1]: passages of the paper the answer read (page 3, passage 2) */
  | { kind: 'passage'; ids: string[] };

export type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] } | { kind: 'h'; text: string };

export const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

const INLINE = /(\[\s*p\d{1,5}-\d{1,4}(?:\s*[,;]\s*p\d{1,5}-\d{1,4})*\s*\]|\[\d{1,3}\](?!\()|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function inlineTokens(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    if (m.index! > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (/^\[\s*p\d/.test(t))
      out.push({
        kind: 'passage',
        ids: t
          .slice(1, -1)
          .split(/[,;]/)
          .map((x) => x.trim()),
      });
    else if (/^\[\d{1,3}\]$/.test(t)) out.push({ kind: 'cite', n: Number(t.slice(1, -1)) });
    else if (t.startsWith('**')) out.push({ kind: 'strong', children: inlineTokens(t.slice(2, -2)) });
    else if (t.startsWith('`')) out.push({ kind: 'code', text: t.slice(1, -1) });
    else if (t.startsWith('[')) {
      const [, label, url] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const href = safeHref(url);
      out.push(href ? { kind: 'link', href, text: label } : { kind: 'text', text: label });
    } else if (t.startsWith('*')) out.push({ kind: 'em', children: inlineTokens(t.slice(1, -1)) });
    else out.push({ kind: 'link', href: t, text: t });
    last = m.index! + t.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const prev = out.at(-1);
    if (!line.trim()) out.push({ kind: 'p', lines: [] });
    else if (heading) out.push({ kind: 'h', text: heading[1] });
    else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1];
      if (prev?.kind === kind) prev.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (prev?.kind === 'p') prev.lines.push(line);
    else out.push({ kind: 'p', lines: [line] });
  }
  return out.filter((b) => b.kind !== 'p' || b.lines.length);
}
