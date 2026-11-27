/* One reference read from an imported file, before it is looked up. */
export type ImportEntry = {
  label: string; // citation key or first words of the title, for the summary
  title: string | null;
  authors: string[];
  year: number | null;
  source: string | null;
  doi: string | null;
  url: string | null;
  type: string | null; // the Citezeno work type (article, book, ...)
  abstract: string | null;
};

/* zotero: read from a connected Zotero library, not a file */
export type ParsedFile = { format: 'bibtex' | 'ris' | 'zotero'; entries: ImportEntry[]; failed: { label: string; reason: string }[] };
