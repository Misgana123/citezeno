/* Citation style engine.
 * Formats normalised source records into 12 standard styles plus BibTeX / RIS / CSL-JSON.
 * Output is HTML (italics/bold as <i>/<b>); use plain() for plain text. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { decodeEntities } from './sources';
import type { Source } from './types';

export type Ctx = { suffix: Map<string, string> };
export type Style = {
  name: string;
  edition: string;
  family: 'author-date' | 'numeric' | 'notes';
  listTitle: string;
  marker: 'paren' | 'sup' | 'bracket' | 'paren-num';
  disambig?: boolean;
  names?: (s: Source) => string;
  entry: (s: Source, ctx?: Ctx) => string;
  cite?: (list: Source[], ctx?: Ctx) => string;
  inName?: (s: Source) => string;
  note?: (s: Source, first: boolean, ctx?: Ctx) => string;
};


const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_MLA = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_IEEE = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

export const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const i = (s) => (s ? `<i>${esc(s)}</i>` : '');
const link = (u: any, label?: any) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(label || u)}</a>` : '');
const doiURL = (s) => (s.doi ? `https://doi.org/${s.doi}` : '');
const hasEnd = (s) => /[.?!]["”’']?$/.test(String(s).replace(/<[^>]+>/g, '').trim());
const dot = (s) => (s ? (hasEnd(s) ? s : s + '.') : '');
// Put a comma/period inside closing quotes (American usage)
const qt = (t, p = '') => {
  const raw = esc(t);
  if (p && hasEnd(t)) return `“${raw}”`;
  return `“${raw}${p}”`;
};
const sq = (t) => `‘${esc(t)}’`;

function parseDate(s) {
  const src = s.date || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(src);
  if (m) return { y: +m[1], m: +m[2], d: +m[3], full: true };
  if (s.year) return { y: s.year, m: s.month || 0, d: 0 };
  return null;
}
function accessed(s) {
  const d = s.accessed ? new Date(s.accessed + 'T12:00:00') : new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}
const fmt = {
  mdy: (d) => (d ? `${d.m ? MONTHS[d.m - 1] + ' ' : ''}${d.d ? d.d + ', ' : ''}${d.y}` : ''),
  dmy: (d) => (d ? `${d.d ? d.d + ' ' : ''}${d.m ? MONTHS[d.m - 1] + ' ' : ''}${d.y}` : ''),
  mla: (d) => (d ? `${d.d ? d.d + ' ' : ''}${d.m ? MON_MLA[d.m - 1] + ' ' : ''}${d.y}` : ''),
  ymd: (d) => (d ? `${d.y}${d.m ? ' ' + MON_SHORT[d.m - 1] : ''}${d.d ? ' ' + d.d : ''}` : ''),
  iso: (d) => (d ? `${d.y}-${String(d.m || 1).padStart(2, '0')}-${String(d.d || 1).padStart(2, '0')}` : ''),
  apa: (d) => (d ? `${d.y}${d.m ? ', ' + MONTHS[d.m - 1] : ''}${d.d ? ' ' + d.d : ''}` : 'n.d.'),
};

/* ---------- names ---------- */
function initials(given, { dots = true, space = true } = {}) {
  if (!given) return '';
  return given.split(/\s+/).filter(Boolean).map((part) =>
    part.split('-').map((p) => {
      const ch = p.replace(/[^A-Za-zÀ-ÿ]/g, '')[0];
      return ch ? ch.toUpperCase() + (dots ? '.' : '') : '';
    }).join(dots ? '-' : '')
  ).filter(Boolean).join(dots && space ? ' ' : '');
}
const famOf = (a) => esc(a.family + (a.suffix ? ', ' + a.suffix : ''));
const inv = (a) => (a.literal || !a.given ? esc(a.family) : `${esc(a.family)}, ${esc(a.given)}`);
const nat = (a) => (a.literal || !a.given ? esc(a.family) : `${esc(a.given)} ${esc(a.family)}`);
const invInit = (a: any, o?: any) => (a.literal || !a.given ? esc(a.family) : `${esc(a.family)}, ${initials(a.given, o)}`);
const initFirst = (a) => (a.literal || !a.given ? esc(a.family) : `${initials(a.given)} ${esc(a.family)}`);
const vanc = (a) => (a.literal || !a.given ? esc(a.family) : `${esc(a.family)} ${initials(a.given, { dots: false })}`);

function andList(arr, conj = 'and', serial = true) {
  if (arr.length <= 1) return arr.join('');
  if (arr.length === 2) return `${arr[0]} ${conj} ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}${serial ? ',' : ''} ${conj} ${arr[arr.length - 1]}`;
}

const A = (s) => s.authors || [];

/* ---------- short title & sort ---------- */
export function shortTitle(t) {
  const main = String(t).split(/[:?!]/)[0];
  const ws = main.split(/\s+/).filter(Boolean);
  return ws.length <= 4 ? main.trim() : ws.slice(0, 4).join(' ');
}
export function sortKey(s) {
  const a = A(s)[0];
  const lead = a ? `${a.family} ${a.given || ''}` : String(s.title).replace(/^(the|a|an)\s+/i, '');
  return `${lead.toLowerCase()} ${s.year || 9999} ${String(s.title).toLowerCase()}`;
}

/* year with optional disambiguation suffix (2020a) */
const Y = (s, ctx) => (s.year ? `${s.year}${(ctx && ctx.suffix && ctx.suffix.get(s.id)) || ''}` : 'n.d.');

const kindOf = (s) => (s.type === 'web' ? 'web' : s.type === 'book' || s.type === 'thesis' || s.type === 'report' ? 'book' : s.type === 'chapter' ? 'chapter' : 'article');
const site = (s) => s.site || s.container || s.publisher || 'Website';

/* =================================================================== */
export const STYLES: Record<string, Style> = {} as any;

/* ---------- APA 7 ---------- */
STYLES.apa = {
  name: 'APA', edition: '7th ed.', family: 'author-date', listTitle: 'References', marker: 'paren', disambig: true,
  names(s) {
    const a = A(s).map((x) => invInit(x));
    if (!a.length) return '';
    if (a.length === 1) return a[0];
    if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, &amp; ${a[a.length - 1]}`;
    return `${a.slice(0, 19).join(', ')}, . . . ${a[a.length - 1]}`;
  },
  entry(s, ctx) {
    const n = this.names(s), k = kindOf(s), y = Y(s, ctx);
    const doi = s.doi ? link(doiURL(s)) : link(s.url);
    if (k === 'web') {
      const d = parseDate(s);
      return `${dot(esc(s.title))} (${d && d.full ? fmt.apa(d) : y}). In ${i(site(s))}. Retrieved ${fmt.mdy(accessed(s))}, from ${link(s.url)}`;
    }
    const lead = n ? `${dot(n)} (${y}).` : '';
    if (k === 'book') {
      const t = i(s.title);
      const bdoi = s.doi ? link(doiURL(s)) : '';
      return n ? `${lead} ${dot(t)} ${s.publisher ? dot(esc(s.publisher)) + ' ' : ''}${bdoi}`.trim()
        : `${dot(t)} (${y}). ${s.publisher ? dot(esc(s.publisher)) + ' ' : ''}${bdoi}`.trim();
    }
    if (k === 'chapter') {
      return `${lead || dot(esc(s.title)) + ` (${y}).`} ${n ? dot(esc(s.title)) + ' ' : ''}In ${i(s.container || 'Edited volume')}${s.pages ? ` (pp. ${esc(s.pages)})` : ''}. ${s.publisher ? dot(esc(s.publisher)) + ' ' : ''}${doi}`.trim();
    }
    const cont = s.container ? `${i(s.container)}${s.volume ? `, ${i(s.volume)}` : ''}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? `, ${esc(s.pages)}` : ''}.` : '';
    return `${lead || dot(esc(s.title)) + ` (${y}).`} ${n ? dot(esc(s.title)) : ''} ${cont} ${doi}`.replace(/\s+/g, ' ').trim();
  },
  cite(list, ctx) {
    return '(' + list.map((s) => { const n = this.inName(s); return `${n}${/,”$/.test(n) ? ' ' : ', '}${Y(s, ctx)}`; }).join('; ') + ')';
  },
  inName(s) {
    const a = A(s);
    if (!a.length) return kindOf(s) === 'book' ? i(shortTitle(s.title)) : qt(shortTitle(s.title), ',');
    if (a.length === 1) return famOf(a[0]);
    if (a.length === 2) return `${famOf(a[0])} &amp; ${famOf(a[1])}`;
    return `${famOf(a[0])} et al.`;
  },
};

/* ---------- MLA 9 ---------- */
STYLES.mla = {
  name: 'MLA', edition: '9th ed.', family: 'author-date', listTitle: 'Works Cited', marker: 'paren',
  names(s) {
    const a = A(s);
    if (!a.length) return '';
    if (a.length === 1) return inv(a[0]);
    if (a.length === 2) return `${inv(a[0])}, and ${nat(a[1])}`;
    return `${inv(a[0])}, et al`;
  },
  entry(s) {
    const n = this.names(s), k = kindOf(s);
    const lead = n ? dot(n) + ' ' : '';
    const loc = s.doi ? doiURL(s) : (s.url || '').replace(/^https?:\/\//, '');
    if (k === 'web') {
      return `${qt(s.title, '.')} ${i(site(s))}, ${esc(s.publisher || 'Wikimedia Foundation')}, ${fmt.mla(parseDate(s))}, ${link(s.url, loc)}. Accessed ${fmt.mla(accessed(s))}.`;
    }
    if (k === 'book') {
      return `${lead}${dot(i(s.title))} ${s.publisher ? esc(s.publisher) + ', ' : ''}${s.year || 'n.d.'}${s.doi ? ', ' + link(doiURL(s)) : ''}.`;
    }
    const parts = [i(s.container)];
    if (s.volume) parts.push(`vol. ${esc(s.volume)}`);
    if (s.issue) parts.push(`no. ${esc(s.issue)}`);
    if (s.year) parts.push(String(s.year));
    if (s.pages) parts.push(`${/[–-]/.test(s.pages) ? 'pp.' : 'p.'} ${esc(s.pages)}`);
    if (loc) parts.push(link(s.doi ? doiURL(s) : s.url, loc));
    return `${lead}${qt(s.title, '.')} ${parts.filter(Boolean).join(', ')}.`;
  },
  cite(list) {
    return '(' + list.map((s) => this.inName(s)).join('; ') + ')';
  },
  inName(s) {
    const a = A(s);
    if (!a.length) return kindOf(s) === 'book' ? i(shortTitle(s.title)) : qt(shortTitle(s.title));
    if (a.length === 1) return famOf(a[0]);
    if (a.length === 2) return `${famOf(a[0])} and ${famOf(a[1])}`;
    return `${famOf(a[0])} et al.`;
  },
};

/* ---------- Chicago 17 notes-bibliography (shared with Turabian) ---------- */
function chicagoBibNames(s) {
  const a = A(s);
  if (!a.length) return '';
  if (a.length > 10) return `${inv(a[0])}, ${a.slice(1, 7).map(nat).join(', ')}, et al`;
  return andList([inv(a[0]), ...a.slice(1).map(nat)]);
}
function chicagoNoteNames(s) {
  const a = A(s);
  if (!a.length) return '';
  if (a.length > 3) return `${nat(a[0])} et al.`;
  return andList(a.map(nat));
}
function chicagoShortNames(s) {
  const a = A(s);
  if (!a.length) return '';
  if (a.length > 3) return `${famOf(a[0])} et al.`;
  return andList(a.map(famOf));
}
const NB: Omit<Style, 'name' | 'edition'> = {
  family: 'notes', listTitle: 'Bibliography', marker: 'sup',
  entry(s) {
    const n = chicagoBibNames(s), k = kindOf(s);
    const lead = n ? dot(n) + ' ' : '';
    const doi = s.doi ? link(doiURL(s)) : link(s.url);
    if (k === 'web') return `${qt(s.title, '.')} ${i(site(s))}. Last modified ${fmt.mdy(parseDate(s))}. ${doi}.`;
    if (k === 'book') return `${lead}${dot(i(s.title))} ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? esc(s.publisher) + ', ' : ''}${s.year || 'n.d.'}.${s.doi ? ' ' + doi + '.' : ''}`;
    if (k === 'chapter') return `${lead}${qt(s.title, '.')} In ${i(s.container)}${s.pages ? `, ${esc(s.pages)}` : ''}. ${s.publisher ? esc(s.publisher) + ', ' : ''}${s.year || 'n.d.'}. ${doi}${doi ? '.' : ''}`;
    return `${lead}${qt(s.title, '.')} ${i(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? `, no. ${esc(s.issue)}` : ''} (${s.year || 'n.d.'})${s.pages ? ': ' + esc(s.pages) : ''}.${doi ? ' ' + doi + '.' : ''}`;
  },
  note(s, first) {
    const k = kindOf(s);
    if (!first) {
      const sn = chicagoShortNames(s);
      const st = k === 'book' ? i(shortTitle(s.title)) : qt(shortTitle(s.title));
      return sn ? `${sn}, ${st}${k === 'book' ? '.' : ''}`.replace(/”$/, '.”') : `${st}`.replace(/”$/, '.”');
    }
    const n = chicagoNoteNames(s);
    const lead = n ? n + ', ' : '';
    const doi = s.doi ? link(doiURL(s)) : link(s.url);
    if (k === 'web') return `${qt(s.title, ',')} ${i(site(s))}, last modified ${fmt.mdy(parseDate(s))}, ${doi}.`;
    if (k === 'book') return `${lead}${i(s.title)} (${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? esc(s.publisher) + ', ' : ''}${s.year || 'n.d.'})${s.doi ? ', ' + doi : ''}.`;
    return `${lead}${qt(s.title, ',')} ${i(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? `, no. ${esc(s.issue)}` : ''} (${s.year || 'n.d.'})${s.pages ? ': ' + esc(s.pages) : ''}${doi ? ', ' + doi : ''}.`;
  },
};
STYLES.chicago = { ...NB, name: 'Chicago', edition: '17th ed. · notes' } as Style;
STYLES.turabian = { ...NB, name: 'Turabian', edition: '9th ed. · notes' } as Style;

/* ---------- Chicago author-date ---------- */
STYLES.chicagoad = {
  name: 'Chicago', edition: '17th ed. · author-date', family: 'author-date', listTitle: 'References', marker: 'paren', disambig: true,
  entry(s, ctx) {
    const n = chicagoBibNames(s), k = kindOf(s), y = Y(s, ctx);
    const doi = s.doi ? link(doiURL(s)) : link(s.url);
    if (k === 'web') return `${i(site(s))}. ${y}. ${qt(s.title, '.')} Last modified ${fmt.mdy(parseDate(s))}. ${doi}.`;
    const lead = n ? `${dot(n)} ${y}.` : `${s.title ? '' : ''}`;
    if (k === 'book') return `${lead || dot(i(s.title)) + ' ' + y + '.'} ${n ? dot(i(s.title)) : ''} ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? dot(esc(s.publisher)) : ''}${s.doi ? ' ' + doi + '.' : ''}`.replace(/\s+/g, ' ').trim();
    return `${lead || qt(s.title, '.') + ' ' + y + '.'} ${n ? qt(s.title, '.') : ''} ${i(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? ` (${esc(s.issue)})` : ''}${s.pages ? ': ' + esc(s.pages) : ''}.${doi ? ' ' + doi + '.' : ''}`.replace(/\s+/g, ' ').trim();
  },
  inName(s) {
    const a = A(s);
    if (!a.length) return kindOf(s) === 'web' ? i(site(s)) : qt(shortTitle(s.title));
    if (a.length > 3) return `${famOf(a[0])} et al.`;
    return andList(a.map(famOf));
  },
  cite(list, ctx) { return '(' + list.map((s) => `${this.inName(s)} ${Y(s, ctx)}`).join('; ') + ')'; },
};

/* ---------- Harvard (Cite Them Right) ---------- */
STYLES.harvard = {
  name: 'Harvard', edition: 'Cite Them Right', family: 'author-date', listTitle: 'Reference list', marker: 'paren', disambig: true,
  names(s) {
    const a = A(s).map((x) => invInit(x, { space: false }));
    if (!a.length) return '';
    if (a.length >= 4) return `${a[0]} <i>et al.</i>`;
    return andList(a, 'and', false);
  },
  entry(s, ctx) {
    const n = this.names(s), k = kindOf(s), y = Y(s, ctx);
    const avail = s.doi ? ` Available at: ${link(doiURL(s))}.` : s.url ? ` Available at: ${link(s.url)} (Accessed: ${fmt.dmy(accessed(s))}).` : '';
    if (k === 'web') return `${esc(site(s))} (${y}) ${dot(i(s.title))} Available at: ${link(s.url)} (Accessed: ${fmt.dmy(accessed(s))}).`;
    const lead = n ? `${n} (${y})` : `${i(s.title)} (${y})`;
    if (k === 'book') return `${lead} ${n ? dot(i(s.title)) : '.'} ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? dot(esc(s.publisher)) : ''}${s.doi ? avail : ''}`.replace(/\s+/g, ' ').replace(' .', '.').trim();
    return `${lead} ${n ? sq(s.title) + ',' : ','} ${i(s.container)}${s.volume ? `, ${esc(s.volume)}` : ''}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? `, pp. ${esc(s.pages)}` : ''}.${avail}`.replace(/\s+/g, ' ').replace(' ,', ',').trim();
  },
  inName(s) {
    const a = A(s);
    if (!a.length) return kindOf(s) === 'web' ? esc(site(s)) : i(shortTitle(s.title));
    if (a.length >= 4) return `${famOf(a[0])} <i>et al.</i>`;
    return andList(a.map(famOf), 'and', false);
  },
  cite(list, ctx) { return '(' + list.map((s) => `${this.inName(s)}, ${Y(s, ctx)}`).join('; ') + ')'; },
};

/* ---------- ASA 7 ---------- */
STYLES.asa = {
  name: 'ASA', edition: '7th ed.', family: 'author-date', listTitle: 'References', marker: 'paren', disambig: true,
  entry(s, ctx) {
    const a = A(s), k = kindOf(s), y = Y(s, ctx);
    const n = a.length ? andList([inv(a[0]), ...a.slice(1).map(nat)]) : '';
    if (k === 'web') return `${esc(site(s))}. ${y}. ${qt(s.title, '.')} Retrieved ${fmt.mdy(accessed(s))} (${link(s.url)}).`;
    const lead = n ? `${dot(n)} ${y}.` : `${qt(s.title, '.')} ${y}.`;
    const doi = s.doi ? ` doi:${link(doiURL(s), s.doi)}.` : '';
    if (k === 'book') return `${lead} ${n ? dot(i(s.title)) : ''} ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? dot(esc(s.publisher)) : ''}${doi}`.replace(/\s+/g, ' ').trim();
    return `${lead} ${n ? qt(s.title, '.') : ''} ${i(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? ':' + esc(s.pages) : ''}.${doi}`.replace(/\s+/g, ' ').trim();
  },
  inName: STYLES.chicagoad.inName,
  cite(list, ctx) { return '(' + list.map((s) => `${this.inName(s)} ${Y(s, ctx)}`).join('; ') + ')'; },
};

/* ---------- IEEE ---------- */
STYLES.ieee = {
  name: 'IEEE', edition: 'Reference Guide', family: 'numeric', listTitle: 'References', marker: 'bracket',
  entry(s) {
    const a = A(s), k = kindOf(s);
    const n = !a.length ? '' : a.length > 6 ? `${initFirst(a[0])} <i>et al.</i>` : andList(a.map(initFirst), 'and', a.length > 2);
    const lead = n ? n + ', ' : '';
    const d = parseDate(s);
    if (k === 'web') return `${qt(s.title, ',')} ${i(site(s))}. Accessed: ${MON_IEEE[accessed(s).m - 1]} ${accessed(s).d}, ${accessed(s).y}. [Online]. Available: ${link(s.url)}`;
    if (k === 'book') return `${lead}${i(s.title)}. ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? esc(s.publisher) + ', ' : ''}${s.year || 'n.d.'}${s.doi ? `, doi: ${link(doiURL(s), s.doi)}` : ''}.`;
    const parts = [i(s.container)];
    if (s.volume) parts.push(`vol. ${esc(s.volume)}`);
    if (s.issue) parts.push(`no. ${esc(s.issue)}`);
    if (s.pages) parts.push(`${/[–-]/.test(s.pages) ? 'pp.' : 'p.'} ${esc(s.pages)}`);
    parts.push(`${d && d.m ? MON_IEEE[d.m - 1] + ' ' : ''}${s.year || 'n.d.'}`);
    return `${lead}${qt(s.title, ',')} ${parts.filter(Boolean).join(', ')}${s.doi ? `, doi: ${link(doiURL(s), s.doi)}` : ''}.`;
  },
};

/* ---------- Vancouver / NLM ---------- */
function vancouverish(maxAll, keep) {
  return (s) => {
    const a = A(s).map(vanc);
    if (!a.length) return '';
    return a.length > maxAll ? `${a.slice(0, keep).join(', ')}, et al` : a.join(', ');
  };
}
STYLES.vancouver = {
  name: 'Vancouver', edition: 'NLM / ICMJE', family: 'numeric', listTitle: 'References', marker: 'paren-num',
  entry(s) {
    const n = vancouverish(6, 6)(s), k = kindOf(s);
    const lead = n ? dot(n) + ' ' : '';
    const d = parseDate(s);
    if (k === 'web') return `${esc(s.title)} [Internet]. ${esc(site(s))}; ${s.year || ''} [updated ${fmt.ymd(d)}; cited ${fmt.ymd(accessed(s))}]. Available from: ${link(s.url)}`;
    if (k === 'book') return `${lead}${dot(esc(s.title))} ${s.place ? esc(s.place) + ': ' : ''}${esc(s.publisher || '[publisher unknown]')}; ${s.year || ''}.`;
    return `${lead}${dot(esc(s.title))} ${dot(esc(s.container))} ${s.year || ''}${d && d.m ? ' ' + MON_SHORT[d.m - 1] : ''};${esc(s.volume)}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? ':' + esc(s.pages) : ''}.${s.doi ? ` doi:${link(doiURL(s), s.doi)}` : ''}`.replace(';.', '.');
  },
};

/* ---------- AMA 11 ---------- */
STYLES.ama = {
  name: 'AMA', edition: '11th ed.', family: 'numeric', listTitle: 'References', marker: 'sup',
  entry(s) {
    const n = vancouverish(6, 3)(s), k = kindOf(s);
    const lead = n ? dot(n) + ' ' : '';
    if (k === 'web') return `${dot(esc(s.title))} ${esc(site(s))}. Updated ${fmt.mdy(parseDate(s))}. Accessed ${fmt.mdy(accessed(s))}. ${link(s.url)}`;
    if (k === 'book') return `${lead}${dot(i(s.title))} ${s.publisher ? esc(s.publisher) + '; ' : ''}${s.year || 'n.d.'}.${s.doi ? ` doi:${link(doiURL(s), s.doi)}` : ''}`;
    return `${lead}${dot(esc(s.title))} ${dot(i(s.container))} ${s.year || ''};${esc(s.volume)}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? ':' + esc(s.pages) : ''}.${s.doi ? ` doi:${link(doiURL(s), s.doi)}` : ''}`.replace(';.', '.');
  },
};

/* ---------- ACS ---------- */
STYLES.acs = {
  name: 'ACS', edition: 'ACS Guide', family: 'numeric', listTitle: 'References', marker: 'sup',
  entry(s) {
    const a = A(s).map((x) => invInit(x));
    const n = a.length ? dot(a.join('; ')) + ' ' : '';
    const k = kindOf(s);
    if (k === 'web') return `${dot(esc(s.title))} ${esc(site(s))}. ${link(s.url)} (accessed ${fmt.iso(accessed(s))}).`;
    if (k === 'book') return `${n}${i(s.title)}; ${s.publisher ? esc(s.publisher) : ''}${s.place ? ': ' + esc(s.place) : ''}, ${s.year || 'n.d.'}.${s.doi ? ` DOI: ${link(doiURL(s), s.doi)}.` : ''}`;
    return `${n}${dot(esc(s.title))} ${i(s.container)} <b>${s.year || 'n.d.'}</b>${s.volume ? `, <i>${esc(s.volume)}</i>` : ''}${s.issue ? ` (${esc(s.issue)})` : ''}${s.pages ? `, ${esc(s.pages)}` : ''}.${s.doi ? ` DOI: ${link(doiURL(s), s.doi)}.` : ''}`;
  },
};

/* ---------- CSE 9 citation-sequence ---------- */
STYLES.cse = {
  name: 'CSE', edition: '9th ed. · C-S', family: 'numeric', listTitle: 'References', marker: 'sup',
  entry(s) {
    const n = vancouverish(10, 10)(s), k = kindOf(s);
    const lead = n ? dot(n) + ' ' : '';
    if (k === 'web') return `${esc(s.title)} [Internet]. ${esc(site(s))}; ${s.year || ''} [modified ${fmt.ymd(parseDate(s))}; accessed ${fmt.ymd(accessed(s))}]. ${link(s.url)}`;
    if (k === 'book') return `${lead}${dot(esc(s.title))} ${s.place ? esc(s.place) + ': ' : ''}${s.publisher ? esc(s.publisher) + '; ' : ''}${s.year || ''}.`;
    return `${lead}${dot(esc(s.title))} ${dot(esc(s.container))} ${s.year || ''};${esc(s.volume)}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? ':' + esc(s.pages) : ''}.${s.doi ? ` ${link(doiURL(s))}` : ''}`.replace(';.', '.');
  },
};

/* Note/short forms for styles that don't define them (used for footnote/endnote output) */
Object.values(STYLES).forEach((st) => {
  if (!st.note) {
    st.note = function (s, first, ctx) {
      if (first || st.family === 'numeric') return st.entry(s, ctx);
      return st.inName ? `${st.inName(s)}${st.family === 'author-date' && st !== STYLES.mla ? (st.name === 'APA' || st.name === 'Harvard' ? ', ' : ' ') + Y(s, ctx) : ''}.` : st.entry(s, ctx);
    };
  }
});

/* ---------- numeric markers ---------- */
function compress(nums) {
  nums = ([...new Set(nums)] as number[]).sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < nums.length; k++) {
    let j = k;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    if (j - k >= 2) out.push([nums[k], nums[j]]);
    else for (let t = k; t <= j; t++) out.push([nums[t]]);
    k = j;
  }
  return out;
}
export function numericMarker(style, nums) {
  const groups = compress(nums);
  if (style.marker === 'bracket') return groups.map((g) => (g.length === 2 ? `[${g[0]}]–[${g[1]}]` : `[${g[0]}]`)).join(', ');
  const inner = groups.map((g) => (g.length === 2 ? `${g[0]}–${g[1]}` : `${g[0]}`)).join(',');
  return style.marker === 'paren-num' ? `(${inner})` : inner;
}

/* ---------- exports ---------- */
function bibKey(s, used) {
  const fam = (A(s)[0] ? A(s)[0].family : s.title.split(/\s+/)[0] || 'anon').normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase() || 'anon';
  const word = (String(s.title).toLowerCase().replace(/^(the|a|an)\s+/, '').match(/[a-z]{3,}/) || ['x'])[0];
  let key = `${fam}${s.year || 'nd'}${word}`;
  let n = 1;
  while (used.has(key)) key = `${fam}${s.year || 'nd'}${word}${++n}`;
  used.add(key);
  return key;
}
const bibEsc = (s) => String(s || '').replace(/([{}&%$#_])/g, '\\$1');
export function bibtex(list) {
  const used = new Set();
  return list.map((s) => {
    const k = kindOf(s);
    const type = k === 'book' ? 'book' : k === 'chapter' ? 'incollection' : k === 'web' ? 'misc' : s.type === 'proceedings' ? 'inproceedings' : 'article';
    const f = [];
    const add = (name, v) => v && f.push(`  ${name.padEnd(9)} = {${v}}`);
    add('title', `{${bibEsc(s.title)}}`);
    add('author', A(s).map((a) => (a.literal ? `{${bibEsc(a.family)}}` : `${bibEsc(a.family)}, ${bibEsc(a.given)}`)).join(' and '));
    add(type === 'article' ? 'journal' : type === 'incollection' ? 'booktitle' : type === 'inproceedings' ? 'booktitle' : '', bibEsc(s.container));
    add('year', s.year);
    add('volume', s.volume); add('number', s.issue);
    add('pages', s.pages && s.pages.replace('–', '--'));
    add('publisher', bibEsc(s.publisher)); add('address', bibEsc(s.place));
    add('doi', s.doi); add('isbn', s.isbn);
    add('url', s.url);
    if (k === 'web') add('urldate', fmt.iso(accessed(s)));
    return `@${type}{${bibKey(s, used)},\n${f.filter((x) => !/^\s+=/.test(x)).join(',\n')}\n}`;
  }).join('\n\n');
}
export function ris(list) {
  return list.map((s) => {
    const k = kindOf(s);
    const ty = k === 'book' ? 'BOOK' : k === 'chapter' ? 'CHAP' : k === 'web' ? 'ELEC' : s.type === 'proceedings' ? 'CPAPER' : 'JOUR';
    const L = [`TY  - ${ty}`, `TI  - ${s.title}`];
    A(s).forEach((a) => L.push(`AU  - ${a.literal ? a.family : `${a.family}, ${a.given}`}`));
    if (s.year) L.push(`PY  - ${s.year}`);
    if (s.date) L.push(`DA  - ${s.date.replace(/-/g, '/')}`);
    if (s.container) L.push(`${k === 'article' ? 'JO' : 'T2'}  - ${s.container}`);
    if (s.volume) L.push(`VL  - ${s.volume}`);
    if (s.issue) L.push(`IS  - ${s.issue}`);
    if (s.pages) { const [sp, ep] = s.pages.split('–'); L.push(`SP  - ${sp}`); if (ep) L.push(`EP  - ${ep}`); }
    if (s.publisher) L.push(`PB  - ${s.publisher}`);
    if (s.place) L.push(`CY  - ${s.place}`);
    if (s.isbn) L.push(`SN  - ${s.isbn}`);
    if (s.doi) L.push(`DO  - ${s.doi}`);
    if (s.url) L.push(`UR  - ${s.url}`);
    if (k === 'web') L.push(`Y2  - ${fmt.iso(accessed(s))}`);
    if (s.abstract && k !== 'book') L.push(`AB  - ${s.abstract.slice(0, 2000)}`);
    L.push('ER  - ');
    return L.join('\r\n');
  }).join('\r\n\r\n');
}
export function csljson(list) {
  const map = { article: 'article-journal', book: 'book', chapter: 'chapter', web: 'webpage', preprint: 'article', proceedings: 'paper-conference', dataset: 'dataset', thesis: 'thesis', report: 'report' };
  const used = new Set();
  return JSON.stringify(list.map((s) => {
    const o: any = { id: bibKey(s, used), type: map[s.type] || 'article-journal', title: s.title };
    if (A(s).length) o.author = A(s).map((a) => (a.literal ? { literal: a.family } : { family: a.family, given: a.given }));
    if (s.year) { const d = parseDate(s); o.issued = { 'date-parts': [[d.y, d.m, d.d].filter(Boolean)] }; }
    if (s.container) o['container-title'] = s.container;
    ['volume', 'issue', 'publisher'].forEach((k) => s[k] && (o[k] = s[k]));
    if (s.place) o['publisher-place'] = s.place;
    if (s.pages) o.page = s.pages.replace('–', '-');
    if (s.doi) o.DOI = s.doi;
    if (s.isbn) o.ISBN = s.isbn;
    if (s.url) o.URL = s.url;
    if (s.type === 'web') { const a = accessed(s); o.accessed = { 'date-parts': [[a.y, a.m, a.d]] }; }
    return o;
  }), null, 2);
}

export function plain(html: string): string {
  return decodeEntities(String(html).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/* Build year-suffix disambiguation (Smith 2020a / 2020b) */
export function disambiguate(style, list) {
  const suffix = new Map();
  if (!style.disambig || !style.inName) return { suffix };
  const groups = new Map();
  list.forEach((s) => {
    const k = plain(style.inName(s)) + '|' + (s.year || 'nd');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  });
  groups.forEach((g) => {
    if (g.length < 2) return;
    g.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    g.forEach((s, idx) => suffix.set(s.id, (s.year ? '' : '-') + String.fromCharCode(97 + idx)));
  });
  return { suffix };
}

export const ORDER = ['apa', 'mla', 'chicago', 'chicagoad', 'harvard', 'turabian', 'asa', 'ieee', 'vancouver', 'ama', 'acs', 'cse'];


export const STYLE_GROUPS: [string, string[]][] = [
  ['Author–date', ['apa', 'mla', 'harvard', 'chicagoad', 'asa']],
  ['Numeric', ['ieee', 'vancouver', 'ama', 'acs', 'cse']],
  ['Notes', ['chicago', 'turabian']],
];

/* Sample records used for the style specimens. */
export const SPECIMENS: Record<'article' | 'book' | 'web', Source> = {
  article: { id: 'spec-a', provider: 'Specimen', type: 'article', title: 'Deep learning', authors: [{ given: 'Yann', family: 'LeCun' }, { given: 'Yoshua', family: 'Bengio' }, { given: 'Geoffrey', family: 'Hinton' }], year: 2015, date: '2015-05-28', container: 'Nature', volume: '521', issue: '7553', pages: '436–444', doi: '10.1038/nature14539', url: 'https://doi.org/10.1038/nature14539', publisher: 'Springer Nature' },
  book: { id: 'spec-b', provider: 'Specimen', type: 'book', title: 'Thinking, Fast and Slow', authors: [{ given: 'Daniel', family: 'Kahneman' }], year: 2011, publisher: 'Farrar, Straus and Giroux', place: 'New York', isbn: '9780374275631', url: 'https://openlibrary.org/works/OL15936512W' },
  web: { id: 'spec-w', provider: 'Specimen', type: 'web', title: 'Photosynthesis', authors: [], site: 'Wikipedia', publisher: 'Wikimedia Foundation', year: 2026, date: '2026-10-21', accessed: '2026-11-04', url: 'https://en.wikipedia.org/wiki/Photosynthesis' },
};

/* Formatted specimen strings for one style and one record. */
export function specimen(id: string, s: Source) {
  const st = STYLES[id];
  const ctx = disambiguate(st, [s]);
  const prefix = st.family === 'numeric' ? (st.marker === 'bracket' ? '[1] ' : '1. ') : '';
  const entry = prefix + st.entry(s, ctx);
  const inText =
    st.family === 'author-date'
      ? st.cite!([s], ctx)
      : st.family === 'numeric'
        ? numericMarker(st, [1])
        : st.note!(s, true, ctx);
  return { style: st, entry, inText, inTextLabel: st.family === 'notes' ? 'First note' : 'In text' };
}
