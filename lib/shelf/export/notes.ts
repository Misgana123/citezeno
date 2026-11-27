import type { ExportRow } from './types';

/* Every note, as one Markdown file, with the paper it belongs to. */
export function notesMarkdown(rows: ExportRow[]): string {
  const withNotes = rows.filter((r) => r.item.note?.trim());
  const parts = withNotes.map(({ item, tags }) => {
    const p = item.paper;
    const meta = [p.authors.slice(0, 3).map((a) => a.name).join(', ') + (p.authors.length > 3 ? ' et al.' : ''), p.year, p.doi && `https://doi.org/${p.doi}`].filter(Boolean).join(' · ');
    return `## ${p.title}\n\n${meta ? `_${meta}_\n\n` : ''}${tags.length ? `Tags: ${tags.map((t) => `#${t}`).join(' ')}\n\n` : ''}${item.note!.trim()}\n`;
  });
  return `# Notes from my Citezeno shelf\n\n${withNotes.length} paper${withNotes.length === 1 ? '' : 's'} with notes.\n\n${parts.join('\n---\n\n')}`;
}

/* "Lovelace 2020 - Analytical engines.pdf", safe on every system, never repeated. */
export function pdfFileNames(rows: ExportRow[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const { item } of rows) {
    const p = item.paper;
    const last = p.authors[0]?.name.trim().split(/\s+/).pop() ?? '';
    const base = [last, p.year, '-', p.title]
      .filter(Boolean)
      .join(' ')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    item.pdfs.forEach((f, i) => {
      let name = `${base}${item.pdfs.length > 1 ? ` (${i + 1})` : ''}.pdf`;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}.pdf`;
      used.add(name.toLowerCase());
      names.set(f.id, name);
    });
  }
  return names;
}
