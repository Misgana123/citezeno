/* Find Papers: the one paper format the rest of the app sees.
   Every paper provider maps its own records to Paper inside its adapter. */

export type PaperAuthor = { name: string; orcid: string | null };

/* The provider's own page for a record, e.g. { label: "OpenAlex", url: "https://openalex.org/W…" }. */
export type PaperRecordLink = { label: string; url: string };

export type Paper = {
  id: string; // Citezeno paper ID: "<provider>:<the provider's ID>", e.g. "openalex:W2741809807"
  provider: string; // the paper provider it came from, e.g. "openalex"
  record: PaperRecordLink | null;
  doi: string | null; // bare DOI, e.g. "10.7717/peerj.4375"
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  publicationDate: string | null;
  source: string | null; // journal, conference or repository name
  type: string | null; // article, book, preprint, ...
  language: string | null;
  abstract: string | null;
  citedByCount: number;
  isOpenAccess: boolean;
  pdfUrl: string | null;
  /* the open-access PDF's license as the provider gives it (e.g. "cc-by"), when known */
  license?: string | null;
  landingUrl: string | null;
  isRetracted: boolean;
  topics: string[];
  referenceIds: string[]; // Citezeno IDs of the papers it cites
};
