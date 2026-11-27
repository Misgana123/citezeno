import { ProviderError } from '../errors';
import type { CloudDocuments, CloudFiles } from '../connectors/types';
import { GOOGLE_DOC, OFFICE } from './drive';
import { PROVIDER } from './http';

/* Google Docs, through Drive: a document's text is its plain-text export, and
   a new document is a .docx Google converts on upload (so the app's own Word
   builder makes it, with no second document format). */

const EXPORT_MAX_BYTES = 10 * 1024 * 1024;

export function googleDocs(drive: CloudFiles): CloudDocuments {
  return {
    async readText(id, maxChars) {
      const f = await drive.get(id);
      if (f.mime !== GOOGLE_DOC) throw new ProviderError('bad_request', `“${f.name}” isn’t a Google Doc.`, { provider: PROVIDER });
      const got = await drive.download(id, { maxBytes: EXPORT_MAX_BYTES, as: 'text' });
      const text = new TextDecoder().decode(got.bytes).replace(/^﻿/, '');
      return { title: f.name, text: text.length > maxChars ? text.slice(0, maxChars) : text, url: f.url };
    },
    createFromDocx: ({ title, bytes }) => drive.upload({ name: title, mime: OFFICE[GOOGLE_DOC].mime, bytes, convert: true }),
  };
}
