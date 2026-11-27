import { json } from '@/lib/http';
import { openCapability } from '@/lib/connectors/access';
import { ConnectorError } from '@/lib/connectors/errors';
import { connectorRoute } from '@/lib/connectors/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 4 * 1024 * 1024;

/* A Word file made in the browser (the studio's export), saved as an editable
   document in the user's connected cloud files. Form: file (.docx), title. */
export const POST = connectorRoute(async ({ req, deps, userId }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const title = String(form?.get('title') ?? '').trim().slice(0, 200) || 'Manuscript';
  if (!(file instanceof Blob) || !file.size) throw new ConnectorError('bad_request', 'No document was sent.');
  if (file.size > MAX_BYTES) throw new ConnectorError('bad_request', 'This document is too large to save this way. Download it instead.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // a .docx is a ZIP: "PK"
  if (file.type !== DOCX || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ConnectorError('bad_request', 'Only Word documents can be saved this way.');
  const { api, label } = await openCapability(deps, userId, 'documents');
  const doc = await api.createFromDocx({ title, bytes });
  return json({ document: { name: doc.name, url: doc.url }, app: label }, 201);
});
