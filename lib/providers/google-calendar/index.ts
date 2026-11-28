import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { googleClient } from '../google-workspace';
import { googleCall } from '../google-workspace/http';
import { googleOAuth } from '../google-workspace/oauth';
import { CALENDAR, googleCalendar } from './calendar';

/* Google Calendar: its own connection (and consent) beside Google Drive, so
   connecting Drive never asks for the calendar. Same OAuth client as Drive
   (GOOGLE_CONNECTOR_CLIENT_ID or the sign-in client), with
   {site}/api/connectors/google-calendar/callback as another redirect URI and
   the Calendar API enabled. Its scopes are "sensitive": Google verifies the
   app (free) before people outside the test users can connect. */

const PROVIDER = 'google-calendar';
const LABEL = 'Google Calendar';
export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];

export const googleCalendarConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'See your events and when you’re free, and add events (deadlines, reading time) to your calendar.',
  services: ['Calendar'],
  capabilities: ['calendar'],
  grantGroup: 'google',
  create(env, gate) {
    const client = googleClient(env);
    if (!client) return null;
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 10 }));
    const oauth = googleOAuth(transport, client, {
      scopes: CALENDAR_SCOPES,
      provider: PROVIDER,
      label: LABEL,
      // the primary calendar's ID is the account's email address
      account: async (token) => {
        const r = await googleCall(transport, token)<{ items?: { id: string; primary?: boolean }[] }>({ method: 'GET', url: `${CALENDAR}/users/me/calendarList`, query: { minAccessRole: 'owner', maxResults: 50 } });
        const primary = r.items?.find((c) => c.primary)?.id;
        return { id: primary ?? 'google-calendar', label: primary ?? 'Google account' };
      },
    });
    return {
      name: PROVIDER,
      auth: { signIn: oauth, apiKey: null },
      open: (c) => ({ calendar: googleCalendar(googleCall(transport, c.accessToken)) }),
      revoke: (c) => oauth.revoke(c),
    };
  },
};
