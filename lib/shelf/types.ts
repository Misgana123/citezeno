/* Shelf (Keep Papers): each user's personal library of papers.
   Every paper uses the Citezeno Paper format from Find Papers. Papers from a
   paper provider are one shared record reused by everyone who saves them;
   papers added by hand, or imported without a match, are private to one user. */
import type { Paper } from '@/lib/papers/types';

/* Where a paper record's details came from. Only "provider" records are shared. */
export type PaperOrigin = 'provider' | 'manual' | 'import';

/* A paper as Shelf stores it: the Paper format, except a private record has no provider. */
export type ShelfPaper = Omit<Paper, 'provider'> & {
  provider: string | null;
  origin: PaperOrigin;
};

export const ADDED_VIA = ['search', 'doi', 'link', 'title', 'upload', 'import', 'manual'] as const;
export type AddedVia = (typeof ADDED_VIA)[number];

export const READING_STATUSES = ['to_read', 'reading', 'done'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

/* One paper in one user's shelf, with how it is organized. */
export type ShelfItem = {
  id: string;
  paper: ShelfPaper;
  addedAt: string;
  addedVia: AddedVia;
  readingStatus: ReadingStatus;
  note: string | null;
  projectIds: string[];
  folderIds: string[];
  tagIds: string[];
  pdfs: ShelfPdf[];
};

/* "pending": text not read yet; "none": a scanned PDF, no text to search. */
export type PdfTextStatus = 'pending' | 'done' | 'none' | 'failed';
export type ShelfPdf = { id: string; fileName: string; sizeBytes: number; pageCount: number | null; textStatus: PdfTextStatus };

export type Project = { id: string; name: string; createdAt: string; count: number };
export type Folder = { id: string; projectId: string; name: string; createdAt: string; count: number };
export type Tag = { id: string; name: string; color: string | null; count: number };
