import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { LABEL, PROVIDER, slackCall } from './http';
import { slackMessages } from './messages';
import { slackOAuth } from './oauth';

/* Slack, as the user (a user token): find and read messages, and post them.
   A Slack app with the user scopes in ./oauth.ts and the redirect URL
   {site}/api/connectors/slack/callback. Until the app is approved in the Slack
   Marketplace, Slack allows reading history only 15 messages a minute.

     SLACK_CLIENT_ID / SLACK_CLIENT_SECRET */

export const slackConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'Find what your lab said about a paper, read threads, and post summaries and answers to a channel as you.',
  services: ['Channels', 'Messages'],
  capabilities: ['messages'],
  create(env, gate) {
    const clientId = env.SLACK_CLIENT_ID?.trim();
    const clientSecret = env.SLACK_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    // Slack's busiest methods allow about 1 call a second per workspace
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 3, ratePerS: Number(env.SLACK_RATE_PER_S) || 1 }));
    const oauth = slackOAuth(transport, { clientId, clientSecret });
    return {
      name: PROVIDER,
      auth: { signIn: oauth, apiKey: null },
      open: (c) => ({ messages: slackMessages(slackCall(transport, c.accessToken), { teamUrl: typeof c.meta?.teamUrl === 'string' ? c.meta.teamUrl : null }) }),
      revoke: (c) => oauth.revoke(c),
    };
  },
};
