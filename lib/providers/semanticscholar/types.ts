/* The parts of a Semantic Scholar paper we read. */
export type S2Paper = {
  paperId?: string;
  externalIds?: { DOI?: string; PubMed?: string; ArXiv?: string; CorpusId?: number } | null;
  url?: string;
  title?: string;
  abstract?: string | null;
  year?: number | null;
  publicationDate?: string | null;
  venue?: string | null;
  journal?: { name?: string } | null;
  authors?: { name?: string }[];
  citationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: { url?: string; license?: string } | null;
  publicationTypes?: string[] | null;
  fieldsOfStudy?: string[] | null;
};
export type S2Search = { total?: number; offset?: number; data?: S2Paper[] };
