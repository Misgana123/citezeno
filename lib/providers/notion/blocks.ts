import type { PageBlock } from '../connectors/types';

/* Between the app's page content (PageBlock, with **bold**, *italic*, `code`
   and [links](https://…) in its text) and Notion's blocks and rich text. */

export type RichText = { type: 'text'; text: { content: string; link: { url: string } | null }; annotations?: { bold?: boolean; italic?: boolean; code?: boolean } };
type Style = { bold?: boolean; italic?: boolean; code?: boolean; link?: string };

/* Notion takes at most 2,000 characters per piece of text, 100 pieces per block. */
const PIECE_MAX = 2000;
const PIECES_MAX = 100;

function piece(content: string, s: Style): RichText[] {
  const out: RichText[] = [];
  for (let i = 0; i < content.length; i += PIECE_MAX) {
    const annotations = { ...(s.bold ? { bold: true } : {}), ...(s.italic ? { italic: true } : {}), ...(s.code ? { code: true } : {}) };
    out.push({ type: 'text', text: { content: content.slice(i, i + PIECE_MAX), link: s.link ? { url: s.link } : null }, ...(Object.keys(annotations).length ? { annotations } : {}) });
  }
  return out;
}

const INLINE = /(\*\*([^*]+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\))|(\*([^*\s][^*]*?)\*)|(_([^_\s][^_]*?)_)/g;

/* Inline marks → rich text. Unclosed marks stay as written. */
export function richText(text: string): RichText[] {
  const out: RichText[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > at) out.push(...piece(text.slice(at, m.index), {}));
    if (m[2] != null) out.push(...piece(m[2], { bold: true }));
    else if (m[4] != null) out.push(...piece(m[4], { code: true }));
    else if (m[6] != null) out.push(...piece(m[6], { link: m[7] }));
    else if (m[9] != null) out.push(...piece(m[9], { italic: true }));
    else if (m[11] != null) out.push(...piece(m[11], { italic: true }));
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(...piece(text.slice(at), {}));
  return out.slice(0, PIECES_MAX);
}

/* A plain value (a title, a cell) as rich text, with no marks read. */
export const plainText = (text: string): RichText[] => piece(text, {}).slice(0, PIECES_MAX);

type NotionBlock = Record<string, unknown> & { object: 'block'; type: string };
const block = (type: string, body: Record<string, unknown>): NotionBlock => ({ object: 'block', type, [type]: body });

export function toNotionBlocks(blocks: PageBlock[]): NotionBlock[] {
  return blocks.flatMap((b): NotionBlock[] => {
    switch (b.type) {
      case 'heading':
        return [block(`heading_${b.level}`, { rich_text: richText(b.text) })];
      case 'paragraph':
        return b.text.split(/\n{2,}/).map((p) => block('paragraph', { rich_text: richText(p) }));
      case 'bullets':
        return b.items.map((i) => block('bulleted_list_item', { rich_text: richText(i) }));
      case 'numbered':
        return b.items.map((i) => block('numbered_list_item', { rich_text: richText(i) }));
      case 'quote':
        return [block('quote', { rich_text: richText(b.text) })];
      case 'code':
        return [block('code', { rich_text: plainText(b.text), language: b.language ?? 'plain text' })];
      case 'divider':
        return [block('divider', {})];
      case 'table': {
        const width = Math.max(1, b.headers.length, ...b.rows.map((r) => r.length));
        const row = (cells: string[]) => block('table_row', { cells: Array.from({ length: width }, (_, i) => richText(cells[i] ?? '')) });
        return [block('table', { table_width: width, has_column_header: true, has_row_header: false, children: [row(b.headers), ...b.rows.map(row)] })];
      }
    }
  });
}

/* ---------- reading ---------- */

type NotionRich = { plain_text?: string; href?: string | null; annotations?: { bold?: boolean; italic?: boolean; code?: boolean } };

export function richToMarkdown(rich: NotionRich[] | undefined): string {
  return (rich ?? [])
    .map((r) => {
      let t = r.plain_text ?? '';
      if (!t) return '';
      if (r.annotations?.code) t = `\`${t}\``;
      if (r.annotations?.bold) t = `**${t}**`;
      if (r.annotations?.italic) t = `*${t}*`;
      if (r.href) t = `[${t}](${r.href})`;
      return t;
    })
    .join('');
}

export type ReadBlock = { type: string; has_children?: boolean } & Record<string, unknown>;

/* One Notion block as a markdown line (children are read separately). */
export function blockToMarkdown(b: ReadBlock, n: number): string {
  const body = (b[b.type] ?? {}) as { rich_text?: NotionRich[]; checked?: boolean; language?: string; title?: string; cells?: NotionRich[][] };
  const text = richToMarkdown(body.rich_text);
  switch (b.type) {
    case 'paragraph':
      return text;
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `${n}. ${text}`;
    case 'to_do':
      return `- [${body.checked ? 'x' : ' '}] ${text}`;
    case 'quote':
    case 'callout':
      return `> ${text}`;
    case 'toggle':
      return `- ${text}`;
    case 'code':
      return `\`\`\`${body.language && body.language !== 'plain text' ? body.language : ''}\n${richToMarkdown(body.rich_text)}\n\`\`\``;
    case 'divider':
      return '---';
    case 'child_page':
    case 'child_database':
      return `[${body.title || 'Untitled'}] (a ${b.type === 'child_page' ? 'page' : 'database'} inside this page)`;
    case 'table_row':
      return `| ${(body.cells ?? []).map((c) => richToMarkdown(c).replace(/\|/g, '\\|')).join(' | ')} |`;
    case 'image':
    case 'video':
    case 'file':
    case 'pdf':
      return `[${b.type}]`;
    case 'bookmark':
    case 'embed':
    case 'link_preview': {
      const url = (b[b.type] as { url?: string } | undefined)?.url;
      return url ? `<${url}>` : '';
    }
    default:
      return text;
  }
}

/* A page or database's title. */
export function titleOf(item: { properties?: Record<string, { type?: string; title?: NotionRich[] }>; title?: NotionRich[] }): string {
  if (item.title) return richToMarkdown(item.title.map((r) => ({ plain_text: r.plain_text }))).trim() || 'Untitled';
  for (const p of Object.values(item.properties ?? {})) if (p.type === 'title') return (p.title ?? []).map((r) => r.plain_text ?? '').join('').trim() || 'Untitled';
  return 'Untitled';
}
