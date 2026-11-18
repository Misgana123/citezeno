'use client';

import type { CompleteResult, PdfSummary } from '@/lib/shelf/service/pdf-upload';
import type { UploadTarget } from '@/lib/shelf/storage/types';
import { ShelfApiError, shelfFetch } from '../api';

/* Upload one PDF: ask our server for a signed form, send the file straight to
   storage (with progress), then let our server check and read it. */

export type UploadStage = 'starting' | 'uploading' | 'reading';

function send(target: UploadTarget, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ShelfApiError('unavailable', 'The upload was refused. Please try again.')));
    xhr.onerror = () => reject(new ShelfApiError('network', 'The upload failed. Check your connection and try again.'));
    xhr.send(form);
  });
}

export async function uploadPdf(file: File, opts: { itemId?: string; onStage?: (s: UploadStage, progress?: number) => void } = {}): Promise<CompleteResult> {
  const stage = opts.onStage ?? (() => {});
  stage('starting');
  const begun = await shelfFetch<{ pdf: PdfSummary; upload: UploadTarget }>('/api/shelf/pdfs', { method: 'POST', body: { fileName: file.name, sizeBytes: file.size, itemId: opts.itemId ?? null } });
  try {
    await send(begun.upload, file, (p) => stage('uploading', p));
  } catch (e) {
    await shelfFetch(`/api/shelf/pdfs/${begun.pdf.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  stage('reading');
  return shelfFetch<CompleteResult>(`/api/shelf/pdfs/${begun.pdf.id}/complete`, { method: 'POST' });
}

export const pdfHref = (id: string) => `/api/shelf/pdfs/${encodeURIComponent(id)}`;

export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
