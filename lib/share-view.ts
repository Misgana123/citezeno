/* Everything a share design needs, built once from a saved trace. Runs on the
   server for the public page and in the browser for the preview, so the two
   can never drift apart. The HTML is sanitised here, whichever side runs it. */
import { exportText, render } from './engine';
import { sanitizeRendered } from './sanitize';
import { MODE_LABEL } from './share-themes';
import { STYLES } from './styles';
import type { Mode, Name, Result, Source } from './types';

export type ShareSource = {
  /* 1-based display number; data-ref attributes in the HTML use n - 1 */
  n: number;
  id: string;
  title: string;
  who: string;
  venue: string;
  year: number | null;
  typeLabel: string;
  url?: string;
  doi?: string;
  providers: string[];
  citedBy?: number;
  /* best match strength for the claim it supports, 0–1; null when added by hand */
  score: number | null;
  retracted: boolean;
};

export type ShareView = {
  title: string;
  /* the sharer's first name, or '' */
  owner: string;
  dateText: string;
  dateShort: string;
  styleId: string;
  styleName: string;
  styleEdition: string;
  modeLabel: string;
  effectiveMode: Mode;
  /* false in "bibliography only" mode: there is no manuscript to show */
  hasDoc: boolean;
  numbered: boolean;
  listTitle: string;
  /* manuscript + reference list, as the renderer produced it (for paged views) */
  docHtml: string;
  /* manuscript only, with its notes */
  bodyHtml: string;
  /* the reference list only */
  refHtml: string;
  bib: string;
  sources: ShareSource[];
  stats: { claims: number; retracted: number; providers: string[]; years: [number, number] | null };
};

const TYPE_LABEL: Record<string, string> = {
  article: 'Article',
  book: 'Book',
  chapter: 'Chapter',
  web: 'Web page',
  preprint: 'Preprint',
  proceedings: 'Proceedings',
  dataset: 'Dataset',
  thesis: 'Thesis',
  report: 'Report',
};

function who(authors: Name[] | undefined) {
  const fam = (authors || []).map((a) => a.family).filter(Boolean);
  if (!fam.length) return '';
  if (fam.length === 1) return fam[0];
  if (fam.length === 2) return `${fam[0]} & ${fam[1]}`;
  return `${fam[0]} et al.`;
}

const venueOf = (s: Source) => s.container || s.publisher || s.site || '';

export function buildShareView(input: { title: string; owner?: string | null; savedAt: number | string | Date; style: string; mode: Mode; result: Result }): ShareView {
  const styleId = STYLES[input.style] ? input.style : 'apa';
  const st = STYLES[styleId];
  const rd = render(input.result, styleId, input.mode, {});

  const docHtml = sanitizeRendered(rd.docHtml);
  const refHtml = sanitizeRendered(rd.refHtml);
  const bodyHtml = rd.docHtml.endsWith(rd.refHtml) ? sanitizeRendered(rd.docHtml.slice(0, rd.docHtml.length - rd.refHtml.length)) : docHtml;

  const best = new Map<string, number>();
  input.result.claims.forEach((c) => c.cands.forEach((x) => c.ids.includes(x.id) && best.set(x.id, Math.max(best.get(x.id) ?? 0, x.score))));

  const sources: ShareSource[] = rd.list.map((s, k) => ({
    n: k + 1,
    id: s.id || `s${k}`,
    title: s.title,
    who: who(s.authors),
    venue: venueOf(s),
    year: s.year ?? null,
    typeLabel: TYPE_LABEL[s.type] || 'Record',
    url: s.url || (s.doi ? `https://doi.org/${s.doi}` : undefined),
    doi: s.doi,
    providers: s.providers && s.providers.length ? s.providers : [s.provider],
    citedBy: s.citedBy,
    score: s.id && best.has(s.id) ? Math.round(best.get(s.id)! * 100) / 100 : null,
    retracted: Boolean(s.retracted),
  }));

  const years = sources.map((s) => s.year).filter((y): y is number => typeof y === 'number' && y > 0);
  const d = new Date(input.savedAt);
  const valid = !Number.isNaN(d.getTime());

  return {
    title: input.title || 'Untitled manuscript',
    owner: (input.owner || '').trim().split(/\s+/)[0] || '',
    dateText: valid ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
    dateShort: valid ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    styleId,
    styleName: st.name,
    styleEdition: st.edition,
    modeLabel: MODE_LABEL[rd.effectiveMode],
    effectiveMode: rd.effectiveMode,
    hasDoc: rd.effectiveMode !== 'list',
    numbered: rd.numbered,
    listTitle: rd.listTitle,
    docHtml,
    bodyHtml,
    refHtml,
    bib: exportText('bibtex', rd),
    sources,
    stats: {
      claims: input.result.claims.filter((c) => c.ids.length).length,
      retracted: sources.filter((s) => s.retracted).length,
      providers: [...new Set(sources.flatMap((s) => s.providers))],
      years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    },
  };
}
