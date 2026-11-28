import { ProviderError } from '../errors';
import type { BytesBody, ConnectorTransport } from '../connectors/http';
import type { CloudFile, CloudFiles } from '../connectors/types';
import { LABEL, PROVIDER, seg, type GraphCall } from './http';

/* OneDrive through Microsoft Graph, as the files capability. Word, Excel and
   PowerPoint files are editable as they are; Graph turns them into PDFs on
   request. Files Citezeno saves go into a "Citezeno" folder. */

type Item = { id: string; name?: string; size?: number; lastModifiedDateTime?: string; webUrl?: string; file?: { mimeType?: string }; folder?: object; remoteItem?: Item };
const SELECT = 'id,name,size,lastModifiedDateTime,webUrl,file,folder,remoteItem';
/* larger uploads go through an upload session (one chunk up to 60 MB) */
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024;
const CONVERTIBLE = /\.(docx?|pptx?|xlsx?|odt|odp|ods|rtf)$/i;

export function toFile(raw: Item): CloudFile {
  const i = raw.remoteItem ? { ...raw.remoteItem, id: raw.id, name: raw.name ?? raw.remoteItem.name } : raw;
  const mime = i.folder ? 'folder' : (i.file?.mimeType ?? 'application/octet-stream');
  return { id: i.id, name: i.name ?? 'file', mime, kind: i.folder ? 'folder' : mime === 'application/pdf' || /\.pdf$/i.test(i.name ?? '') ? 'pdf' : 'other', sizeBytes: i.size ?? null, modifiedAt: i.lastModifiedDateTime ?? null, url: i.webUrl ?? null };
}

/* A name in a drive path: no slashes, nothing odd. */
const safeName = (n: string) => n.replace(/[\\/:*?"<>|#%]/g, '_').trim().slice(0, 200) || 'file';

export function oneDrive(call: GraphCall, transport: ConnectorTransport): CloudFiles {
  return {
    async list({ query, limit }) {
      const top = Math.min(50, Math.max(1, limit));
      const q = query?.trim();
      const r = q
        ? await call<{ value?: Item[] }>({ method: 'GET', path: `/me/drive/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')`, query: { $top: top, $select: SELECT } })
        : await call<{ value?: Item[] }>({ method: 'GET', path: '/me/drive/recent', query: { $top: top } });
      return (r.value ?? []).map(toFile).slice(0, top);
    },

    get: async (id) => toFile(await call<Item>({ method: 'GET', path: `/me/drive/items/${seg(id)}`, query: { $select: SELECT } })),

    async download(id, { maxBytes, as }) {
      const f = toFile(await call<Item>({ method: 'GET', path: `/me/drive/items/${seg(id)}`, query: { $select: SELECT } }));
      if (f.kind === 'folder') throw new ProviderError('bad_request', `“${f.name}” is a folder.`, { provider: PROVIDER });
      const pdf = as === 'pdf' && f.kind !== 'pdf';
      if (pdf && !CONVERTIBLE.test(f.name)) throw new ProviderError('unsupported', `${LABEL} can’t turn “${f.name}” into a PDF.`, { provider: PROVIDER });
      const got = await call<BytesBody>({ method: 'GET', path: `/me/drive/items/${seg(id)}/content`, ...(pdf ? { query: { format: 'pdf' } } : {}), expect: 'bytes', maxBytes });
      return pdf ? { name: f.name.replace(/\.[^.]+$/, '.pdf'), mime: 'application/pdf', bytes: got.bytes } : { name: f.name, mime: f.mime, bytes: got.bytes };
    },

    async upload(f) {
      const path = `/me/drive/root:/Citezeno/${encodeURIComponent(safeName(f.name))}:`;
      if (f.bytes.byteLength <= SIMPLE_UPLOAD_MAX) {
        return toFile(await call<Item>({ method: 'PUT', path: `${path}/content`, query: { '@microsoft.graph.conflictBehavior': 'rename' }, raw: { bytes: f.bytes, contentType: f.mime } }));
      }
      const session = await call<{ uploadUrl: string }>({ method: 'POST', path: `${path}/createUploadSession`, json: { item: { '@microsoft.graph.conflictBehavior': 'rename' } } });
      // the upload URL carries its own permission: no token is sent to it
      const n = f.bytes.byteLength;
      const done = await transport.call<Item>({ method: 'PUT', url: session.uploadUrl, headers: { 'content-range': `bytes 0-${n - 1}/${n}` }, raw: { bytes: f.bytes, contentType: 'application/octet-stream' } });
      return toFile(done.body);
    },
  };
}
