import type { ShelfItem } from '../types';

/* A shelf item with its group names resolved, ready to write out. */
export type ExportRow = { item: ShelfItem; projects: string[]; folders: string[]; tags: string[] };
export type ExportFormat = 'bibtex' | 'ris' | 'csv';

export const EXPORT_FILES: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  bibtex: { ext: 'bib', mime: 'application/x-bibtex', label: 'BibTeX (.bib)' },
  ris: { ext: 'ris', mime: 'application/x-research-info-systems', label: 'RIS (.ris)' },
  csv: { ext: 'csv', mime: 'text/csv', label: 'CSV (spreadsheet)' },
};
