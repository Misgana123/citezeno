import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { outlookCalendar } from './calendar';
import { graphCall, LABEL, PROVIDER } from './http';
import { outlookMail } from './mail';
import { microsoftOAuth } from './oauth';
import { oneDrive } from './onedrive';

/* Microsoft 365: Outlook mail and calendar, and OneDrive, on one sign-in.
   Needs an app registration in Microsoft Entra (any organization and personal
   accounts) with {site}/api/connectors/microsoft/callback as a web redirect URI:

     MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET
     MICROSOFT_RATE_PER_S   optional, Graph calls per second (default 8) */

export const microsoftConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'Find and read your Outlook mail and write drafts, see and add calendar events, and add files from OneDrive.',
  services: ['Outlook mail', 'Outlook calendar', 'OneDrive'],
  capabilities: ['mail', 'calendar', 'files'],
  create(env, gate) {
    const clientId = env.MICROSOFT_CLIENT_ID?.trim();
    const clientSecret = env.MICROSOFT_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    const rate = Number(env.MICROSOFT_RATE_PER_S) || 8;
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 8, ratePerS: rate }));
    return {
      name: PROVIDER,
      auth: { signIn: microsoftOAuth(transport, { clientId, clientSecret }), apiKey: null },
      open(c) {
        const call = graphCall(transport, c.accessToken);
        return { mail: outlookMail(call), calendar: outlookCalendar(call), files: oneDrive(call, transport) };
      },
    };
  },
};
