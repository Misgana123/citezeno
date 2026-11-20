'use client';

import type { Paper } from '@/lib/papers/types';
import { shelfFetch, ShelfApiError } from '../shelf/api';
import { uploadPdf } from '../shelf/pdf/upload';
import { markSaved } from '../shelf/saved-store';
import type { ReaderData } from './api';

/* The reader's paper in the Citezeno Paper format (what the shelf saves). */
export const asPaper = (p: ReaderData['paper']): Paper => ({ ...p, provider: p.provider ?? '', topics: [], referenceIds: [] });

/* Make sure the paper is on the user's shelf; its item ID. */
export async function ensureOnShelf(data: ReaderData): Promise<{ itemId: string; created: boolean }> {
  if (data.shelf) return { itemId: data.shelf.itemId, created: false };
  try {
    const r = await shelfFetch<{ item: { id: string } }>('/api/shelf/papers', { method: 'POST', body: { via: 'search', paperId: data.paper.id, paper: asPaper(data.paper) } });
    markSaved(data.paper.id, r.item.id);
    return { itemId: r.item.id, created: true };
  } catch (e) {
    const err = e as ShelfApiError;
    if (err.code === 'duplicate' && err.itemId) return { itemId: err.itemId, created: false };
    throw e;
  }
}

/* Upload a PDF for this paper (saving the paper to the shelf first when needed). */
export async function uploadForPaper(data: ReaderData, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  const { itemId } = await ensureOnShelf(data);
  await uploadPdf(file, { itemId, onStage: (s, p) => s === 'uploading' && p != null && onProgress?.(p) });
}

/* Take a paper off the shelf again (Undo after an automatic save). */
export async function removeFromShelf(paperId: string, itemId: string): Promise<void> {
  await shelfFetch(`/api/shelf/papers/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  markSaved(paperId, null);
}
