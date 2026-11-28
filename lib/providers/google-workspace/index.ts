import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import type { Env } from '../types';
import { googleDocs } from './docs';
import { googleDrive } from './drive';
import { googleCall, LABEL, PROVIDER } from './http';
import { googleOAuth } from './oauth';
import { googlePicker } from './picker';
import { googleSheets } from './sheets';

/* Google Drive, Docs and Sheets: one connection, one OAuth client. It reuses
   the sign-in client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) unless its own
   is set; the client needs {site}/api/connectors/google/callback as an
   authorized redirect URI, and the Drive, Sheets and Picker APIs enabled.

     GOOGLE_CONNECTOR_CLIENT_ID / GOOGLE_CONNECTOR_CLIENT_SECRET   optional, a separate client
     GOOGLE_PICKER_API_KEY         a browser key limited to the Picker API (picking files)
     GOOGLE_CLOUD_PROJECT_NUMBER   the Cloud project's number (the Picker's app ID) */

export function googleClient(env: Env): { clientId: string; clientSecret: string } | null {
  const clientId = (env.GOOGLE_CONNECTOR_CLIENT_ID || env.GOOGLE_CLIENT_ID)?.trim();
  const clientSecret = (env.GOOGLE_CONNECTOR_CLIENT_ID ? env.GOOGLE_CONNECTOR_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET)?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: 'Google Drive',
  description: 'Open PDFs from Drive in the reader or add them to your shelf, read Docs and Sheets, and save documents and tables to Drive.',
  services: ['Drive', 'Docs', 'Sheets'],
  capabilities: ['files', 'documents', 'sheets'],
  // Google Calendar connects with the same OAuth client (one grant)
  grantGroup: 'google',
  create(env, gate) {
    const client = googleClient(env);
    if (!client) return null;
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 10 }));
    const oauth = googleOAuth(transport, client);
    const picker = googlePicker(env);
    return {
      name: PROVIDER,
      auth: { signIn: oauth, apiKey: null },
      open(c) {
        const call = googleCall(transport, c.accessToken);
        const files = googleDrive(call);
        return { files, documents: googleDocs(files), sheets: googleSheets(call) };
      },
      revoke: (c) => oauth.revoke(c),
      picker: (c) => picker(c.accessToken),
    };
  },
};

