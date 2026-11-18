import { toDoi } from '@/lib/papers/ids';

/* Shared clean-up for imported fields. */

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', c: 'ć', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', Y: 'Ý', C: 'Ć', N: 'Ń', S: 'Ś', Z: 'Ź' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', n: 'ň', C: 'Č', S: 'Š', Z: 'Ž', R: 'Ř' },
  '=': { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū' },
  '.': { z: 'ż', Z: 'Ż' },
  H: { o: 'ő', u: 'ű', O: 'Ő', U: 'Ű' },
  r: { a: 'å', A: 'Å' },
};
const SYMBOLS: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', '&': '&', '%': '%', $: '$', _: '_', '#': '#' };

/* LaTeX in BibTeX values → plain text: accents, symbols, dashes, and no braces. */
export function latexToText(s: string): string {
  return s
    .replace(/\\([`'^"~=.Hcvr])\s*\{?\s*\\?([a-zA-Z])\s*\}?/g, (m, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? ch)
    .replace(/\\(ss|ae|AE|oe|OE|aa|AA|[oOlLi])(?![a-zA-Z])\s*/g, (m, k: string) => SYMBOLS[k] ?? m)
    .replace(/\\([&%$_#])/g, '$1')
    .replace(/\\(?:emph|textit|textbf|textsc|mathrm|mbox|text)\s*/g, '')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* "Lovelace, Ada" → "Ada Lovelace"; "Ada Lovelace" stays; corporate names stay. */
export function personName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  if (parts.length === 3) return `${parts[2]} ${parts[0]} ${parts[1]}`; // "von Last, Jr, First"
  return s;
}

export function yearFrom(s: string | null | undefined): number | null {
  const m = s?.match(/\b(1[5-9]\d\d|20\d\d|21\d\d)\b/);
  return m ? Number(m[1]) : null;
}

export const cleanDoi = (s: string | null | undefined) => toDoi(s?.replace(/^\s*(doi:|https?:\/\/(dx\.)?doi\.org\/)/i, '').trim() ?? null);

export const httpUrl = (s: string | null | undefined) => {
  const u = s?.trim().split(/\s+/)[0];
  return u && /^https?:\/\/\S+$/i.test(u) ? u.slice(0, 2000) : null;
};

export const clip = (s: string | null | undefined, max: number) => (s ? s.slice(0, max) : null);

export const labelFor = (key: string | null, title: string | null, n: number) => key || (title ? title.split(' ').slice(0, 8).join(' ') : `Entry ${n}`);
