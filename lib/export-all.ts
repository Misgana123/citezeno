/* "Download all drafts": one .zip, built in the browser, holding for every trace
   its draft (.txt), its bibliography in the trace's citation style (.txt) and
   the full trace data (.json). No server work beyond reading the saved traces. */
import { render } from './engine';
import { fromSaved, type Saved } from './library';
import { STYLES } from './styles';
import { zip } from './zip';

const pad = (n: number) => String(n).padStart(2, '0');

/* 2026-11-17, in the viewer's own time zone */
export function datePart(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* A title that is safe as a file name on Windows, macOS and Linux. */
export function safeName(title: string, max = 60) {
  const s = (title || '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|[. ]+$/g, '');
  const cut = s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') || s.slice(0, max) : s;
  return cut.trim() || 'Untitled';
}

/* The plain-text reference list of a trace, in its own style. */
export function bibliographyText(s: Saved) {
  const style = STYLES[s.style] ? s.style : 'apa';
  const r = render(fromSaved(s), style, 'list', {});
  if (!r.list.length) return 'No sources were cited in this trace.\n';
  return `${r.refPlain.trim()}\n`;
}

/* The three files for one trace. `taken` keeps names unique across the archive. */
export function traceFiles(s: Saved, taken = new Set<string>()) {
  let base = `${datePart(s.savedAt)} ${safeName(s.title)}`;
  for (let n = 2; taken.has(base.toLowerCase()); n++) base = `${datePart(s.savedAt)} ${safeName(s.title)} (${n})`;
  taken.add(base.toLowerCase());
  const styleName = STYLES[s.style]?.name || 'APA';
  let bib: string;
  try {
    bib = bibliographyText(s);
  } catch {
    bib = 'The bibliography could not be formatted for this trace. The full data is in the .json file.\n';
  }
  return [
    { name: `${base} - draft.txt`, data: s.draft.endsWith('\n') ? s.draft : `${s.draft}\n` },
    { name: `${base} - bibliography (${safeName(styleName, 30)}).txt`, data: bib },
    { name: `${base} - trace.json`, data: JSON.stringify(s, null, 2) },
  ];
}

/* One archive for many traces, newest first. */
export function buildArchive(list: Saved[]): Uint8Array {
  const taken = new Set<string>();
  return zip([...list].sort((a, b) => b.savedAt - a.savedAt).flatMap((s) => traceFiles(s, taken)));
}

export const archiveName = (now = Date.now()) => `citezeno-drafts-${datePart(now)}.zip`;
export const singleArchiveName = (s: Saved) => `${datePart(s.savedAt)} ${safeName(s.title)}.zip`;

/* Fetch the full data of every library row, a few at a time. Rows that fail are
   reported, not fatal. `get` loads one row that arrived without its data. */
export async function collectFull<T extends { id: string; title: string; result?: unknown }>(
  items: T[],
  get: (id: string) => Promise<Saved>,
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<{ saved: Saved[]; failed: string[] }> {
  const saved: Saved[] = [];
  const failed: string[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++];
      try {
        saved.push(it.result ? (it as unknown as Saved) : await get(it.id));
      } catch {
        failed.push(it.title || it.id);
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { saved, failed };
}
