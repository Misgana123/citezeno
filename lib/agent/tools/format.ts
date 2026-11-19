import type { Paper } from '@/lib/papers/types';
import type { Folder, Project, ShelfItem, Tag } from '@/lib/shelf/types';

/* What the model reads about papers and saved items: enough to answer and to
   act, short enough to keep tool results small. Retracted papers say so. */

const ABSTRACT_CHARS = 600;

const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function authors(p: Pick<Paper, 'authors'>) {
  const names = p.authors.map((a) => a.name);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.join(', ');
}

export function paperBrief(p: Paper, opts: { fullAbstract?: boolean } = {}) {
  return {
    paperId: p.id,
    title: p.title,
    authors: authors(p),
    year: p.year,
    source: p.source,
    doi: p.doi,
    link: p.doi ? `https://doi.org/${p.doi}` : (p.landingUrl ?? p.record?.url ?? null),
    citedByCount: p.citedByCount,
    openAccess: p.isOpenAccess,
    ...(p.isRetracted ? { retracted: true } : {}),
    abstract: opts.fullAbstract ? p.abstract : clip(p.abstract, ABSTRACT_CHARS),
  };
}

export type Groups = { projects: Project[]; folders: Folder[]; tags: Tag[] };

const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean);

export function itemBrief(i: ShelfItem, g: Groups) {
  const p = i.paper;
  return {
    itemId: i.id,
    paperId: p.id,
    title: p.title,
    authors: authors(p),
    year: p.year,
    doi: p.doi,
    ...(p.isRetracted ? { retracted: true } : {}),
    readingStatus: i.readingStatus,
    projects: names(i.projectIds, g.projects),
    folders: names(i.folderIds, g.folders),
    tags: names(i.tagIds, g.tags),
    note: clip(i.note, 300),
    pdfs: i.pdfs.length,
  };
}
