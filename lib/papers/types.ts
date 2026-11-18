/* Find Papers: the one paper format the rest of the app sees.
   Raw OpenAlex data never leaves lib/papers; everything is mapped to Paper. */

export type PaperAuthor = { name: string; orcid: string | null };

export type Paper = {
  id: string; // Citezeno ID (the OpenAlex work ID, e.g. "W2741809807")
  openalexId: string;
  doi: string | null; // bare DOI, e.g. "10.7717/peerj.4375"
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  publicationDate: string | null;
  source: string | null; // journal, conference or repository name
  type: string | null; // article, book, preprint, ...
  language: string | null;
  abstract: string | null; // rebuilt from the inverted index
  citedByCount: number;
  isOpenAccess: boolean;
  pdfUrl: string | null;
  landingUrl: string | null;
  isRetracted: boolean;
  topics: string[];
  referencedWorkIds: string[];
};
