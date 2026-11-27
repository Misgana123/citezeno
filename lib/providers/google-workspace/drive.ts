import { ProviderError } from '../errors';
import type { CloudFile, CloudFiles, DownloadedFile } from '../connectors/types';
import type { BytesBody } from '../connectors/http';
import { DRIVE, DRIVE_UPLOAD, PROVIDER, multipartRelated, type GoogleCall } from './http';

/* Google Drive files (v3), with drive.file access: only files the user picked
   or Citezeno made are visible. Google's own documents are exported. */

export const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink';

const G = 'application/vnd.google-apps.';
export const GOOGLE_DOC = `${G}document`;
export const GOOGLE_SHEET = `${G}spreadsheet`;
export const GOOGLE_SLIDES = `${G}presentation`;
const FOLDER = `${G}folder`;

export const OFFICE: Record<string, { mime: string; ext: string }> = {
  [GOOGLE_DOC]: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  [GOOGLE_SHEET]: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  [GOOGLE_SLIDES]: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
};

/* Office files Google can turn into its own documents on upload. */
const CONVERTS_TO: Record<string, string> = {
  [OFFICE[GOOGLE_DOC].mime]: GOOGLE_DOC,
  [OFFICE[GOOGLE_SHEET].mime]: GOOGLE_SHEET,
  [OFFICE[GOOGLE_SLIDES].mime]: GOOGLE_SLIDES,
  'text/csv': GOOGLE_SHEET,
};

export type DriveFile = { id?: string; name?: string; mimeType?: string; size?: string; modifiedTime?: string; webViewLink?: string };

export function kindOf(mime: string): CloudFile['kind'] {
  if (mime === GOOGLE_DOC) return 'document';
  if (mime === GOOGLE_SHEET) return 'spreadsheet';
  if (mime === GOOGLE_SLIDES) return 'presentation';
  if (mime === FOLDER) return 'folder';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function toCloudFile(f: DriveFile): CloudFile {
  const mime = f.mimeType ?? 'application/octet-stream';
  const size = Number(f.size);
  return { id: f.id ?? '', name: f.name ?? 'Untitled', mime, kind: kindOf(mime), sizeBytes: Number.isFinite(size) && f.size ? size : null, modifiedAt: f.modifiedTime ?? null, url: f.webViewLink ?? null };
}

/* Drive's query language: quotes and backslashes escaped. */
export const driveQuoted = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/* Which export a Google document gets for each wish. */
export function exportMime(mime: string, as: 'pdf' | 'text' | 'csv' | 'office'): { mime: string; ext: string } {
  if (as === 'pdf') return { mime: 'application/pdf', ext: 'pdf' };
  if (as === 'csv' || (as === 'text' && mime === GOOGLE_SHEET)) return mime === GOOGLE_SHEET ? { mime: 'text/csv', ext: 'csv' } : { mime: 'text/plain', ext: 'txt' };
  if (as === 'text') return { mime: 'text/plain', ext: 'txt' };
  return OFFICE[mime] ?? { mime: 'application/pdf', ext: 'pdf' };
}

const withExt = (name: string, ext: string) => (name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`);

export function googleDrive(call: GoogleCall): CloudFiles {
  const get = async (id: string) => toCloudFile(await call<DriveFile>({ method: 'GET', url: `${DRIVE}/files/${encodeURIComponent(id)}`, query: { fields: FILE_FIELDS, supportsAllDrives: true } }));
  return {
    async list({ query, limit }) {
      const q = ['trashed = false', `mimeType != '${FOLDER}'`, ...(query?.trim() ? [`name contains ${driveQuoted(query.trim())}`] : [])].join(' and ');
      const r = await call<{ files?: DriveFile[] }>({ method: 'GET', url: `${DRIVE}/files`, query: { q, orderBy: 'modifiedTime desc', pageSize: Math.min(100, Math.max(1, limit)), fields: `files(${FILE_FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true } });
      return (r.files ?? []).map(toCloudFile);
    },
    get,
    async download(id, { maxBytes, as }): Promise<DownloadedFile> {
      const f = await get(id);
      if (f.kind === 'folder') throw new ProviderError('bad_request', 'That is a folder, not a file.', { provider: PROVIDER });
      if (f.mime.startsWith('application/vnd.google-apps.')) {
        if (!(f.mime in OFFICE)) throw new ProviderError('unsupported', 'This kind of Google file can’t be downloaded.', { provider: PROVIDER });
        const out = exportMime(f.mime, as ?? 'office');
        const got = await call<BytesBody>({ method: 'GET', url: `${DRIVE}/files/${encodeURIComponent(id)}/export`, query: { mimeType: out.mime }, expect: 'bytes', maxBytes });
        return { name: withExt(f.name, out.ext), mime: out.mime, bytes: got.bytes };
      }
      if (f.sizeBytes != null && f.sizeBytes > maxBytes) throw new ProviderError('bad_request', `This file is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`, { provider: PROVIDER, reason: 'too_large' });
      const got = await call<BytesBody>({ method: 'GET', url: `${DRIVE}/files/${encodeURIComponent(id)}`, query: { alt: 'media', supportsAllDrives: true }, expect: 'bytes', maxBytes });
      return { name: f.name, mime: f.mime || got.contentType, bytes: got.bytes };
    },
    async upload({ name, mime, bytes, convert }) {
      const target = convert ? CONVERTS_TO[mime] : undefined;
      const metadata = { name: target ? name.replace(/\.(docx|xlsx|pptx|csv)$/i, '') : name, ...(target ? { mimeType: target } : {}) };
      const raw = multipartRelated(metadata, { bytes, mime });
      return toCloudFile(await call<DriveFile>({ method: 'POST', url: `${DRIVE_UPLOAD}/files`, query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: true }, raw }));
    },
  };
}
