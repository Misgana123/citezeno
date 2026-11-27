import type { RefItem, RefItemInput } from '../connectors/types';

/* Between Zotero's items and the references the shelf understands. */

export type ZoteroCreator = { creatorType?: string; firstName?: string; lastName?: string; name?: string };
export type ZoteroData = {
  key?: string;
  version?: number;
  itemType?: string;
  title?: string;
  creators?: ZoteroCreator[];
  date?: string;
  DOI?: string;
  url?: string;
  abstractNote?: string;
  extra?: string;
  tags?: { tag: string }[];
  collections?: string[];
  publicationTitle?: string;
  bookTitle?: string;
  proceedingsTitle?: string;
  websiteTitle?: string;
  blogTitle?: string;
  publisher?: string;
  university?: string;
  institution?: string;
  repository?: string;
  [field: string]: unknown;
};
export type ZoteroItem = { key: string; version: number; data: ZoteroData; meta?: { parsedDate?: string } };

/* Not references: notes, attachments and annotations. */
export const SKIPPED_TYPES = new Set(['note', 'attachment', 'annotation']);

const TO_CITEZENO: Record<string, string> = {
  journalArticle: 'article',
  magazineArticle: 'article',
  newspaperArticle: 'article',
  conferencePaper: 'article',
  blogPost: 'article',
  preprint: 'preprint',
  book: 'book',
  bookSection: 'book-chapter',
  thesis: 'dissertation',
  report: 'report',
  dataset: 'dataset',
  standard: 'standard',
};

const TO_ZOTERO: Record<string, string> = { article: 'journalArticle', preprint: 'preprint', book: 'book', 'book-chapter': 'bookSection', dissertation: 'thesis', report: 'report', dataset: 'dataset', standard: 'standard' };

/* Where each kind keeps its "published in" (journal, book, university…). */
const SOURCE_FIELD: Record<string, string> = {
  journalArticle: 'publicationTitle',
  magazineArticle: 'publicationTitle',
  newspaperArticle: 'publicationTitle',
  conferencePaper: 'proceedingsTitle',
  preprint: 'repository',
  book: 'publisher',
  bookSection: 'bookTitle',
  thesis: 'university',
  report: 'institution',
  dataset: 'repository',
  blogPost: 'blogTitle',
  webpage: 'websiteTitle',
  document: 'publisher',
};

/* Kinds with a DOI field of their own; the others keep it in "extra" ("DOI: 10…"), as Zotero itself does. */
const DOI_FIELD = new Set(['journalArticle', 'conferencePaper', 'preprint', 'dataset']);

const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;

export function cleanDoi(v: string | null | undefined): string | null {
  const m = v ? DOI_IN_TEXT.exec(v) : null;
  return m ? m[1].replace(/[.,;)\]]+$/, '').toLowerCase() : null;
}

function author(c: ZoteroCreator): string | null {
  if (c.name?.trim()) return c.name.trim();
  const name = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean).join(' ');
  return name || null;
}

const yearOf = (parsed: string | undefined, date: string | undefined) => {
  const m = /\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/.exec(parsed || date || '');
  return m ? Number(m[1]) : null;
};

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function fromZotero(it: ZoteroItem): RefItem {
  const d = it.data;
  const type = d.itemType ?? 'document';
  const creators = d.creators ?? [];
  const main = creators.filter((c) => !c.creatorType || c.creatorType === 'author' || c.creatorType === 'inventor' || c.creatorType === 'presenter');
  const sourceField = SOURCE_FIELD[type];
  return {
    key: it.key,
    version: it.version,
    type: TO_CITEZENO[type] ?? 'other',
    title: text(d.title),
    authors: (main.length ? main : creators).map(author).filter((a): a is string => !!a),
    year: yearOf(it.meta?.parsedDate, d.date),
    source: (sourceField && text(d[sourceField])) || text(d.publicationTitle) || text(d.bookTitle) || text(d.publisher),
    doi: cleanDoi(d.DOI) ?? cleanDoi(/^DOI:\s*(.+)$/im.exec(d.extra ?? '')?.[1]),
    url: text(d.url) && /^https?:\/\//i.test(d.url!) ? d.url!.trim() : null,
    abstract: text(d.abstractNote),
    tags: (d.tags ?? []).map((t) => t.tag).filter(Boolean),
    collections: d.collections ?? [],
  };
}

/* "Ada Lovelace" → first and last name; one word stays a single name. */
function creator(name: string): ZoteroCreator {
  const n = name.trim();
  if (n.includes(',')) {
    const [last, first] = n.split(',', 2).map((s) => s.trim());
    return { creatorType: 'author', firstName: first, lastName: last };
  }
  const parts = n.split(/\s+/);
  if (parts.length === 1) return { creatorType: 'author', name: n };
  return { creatorType: 'author', firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function toZotero(r: RefItemInput, collectionKey?: string | null): ZoteroData {
  const itemType = TO_ZOTERO[r.type] ?? 'document';
  const out: ZoteroData = {
    itemType,
    title: r.title ?? 'Untitled',
    creators: r.authors.slice(0, 100).map(creator),
    date: r.year ? String(r.year) : '',
    url: r.url ?? '',
    abstractNote: r.abstract ?? '',
    tags: (r.tags ?? []).map((tag) => ({ tag })),
    collections: collectionKey ? [collectionKey] : [],
  };
  const sourceField = SOURCE_FIELD[itemType];
  if (r.source && sourceField) out[sourceField] = r.source;
  if (r.doi) {
    if (DOI_FIELD.has(itemType)) out.DOI = r.doi;
    else out.extra = `DOI: ${r.doi}`;
  }
  return out;
}
