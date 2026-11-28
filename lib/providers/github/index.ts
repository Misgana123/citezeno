import { connectorPolicy, connectorTransport } from '../connectors/http';
import type { ConnectorDefinition } from '../connectors/types';
import { githubCall, LABEL, PROVIDER } from './http';
import { githubOAuth } from './oauth';
import { githubRepos } from './repos';

/* GitHub, through a GitHub App (not the GitHub app used to sign in to
   Citezeno). The user installs it on the repositories Citezeno may see, and
   signs in as themselves. In the app's settings: callback URL
   {site}/api/connectors/github/callback, "Expire user authorization tokens" on,
   permissions Contents (read), Issues (read and write), Pull requests (read),
   Metadata (read).

     GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET
     GITHUB_APP_SLUG   the app's URL name (github.com/apps/<slug>), for choosing repositories */

export const githubConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'Read code and data in the repositories you choose, search them, read issues and pull requests, and open issues.',
  services: ['Repositories', 'Issues'],
  capabilities: ['repos'],
  create(env, gate) {
    const clientId = env.GITHUB_APP_CLIENT_ID?.trim();
    const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    const slug = env.GITHUB_APP_SLUG?.trim();
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 6 }));
    const oauth = githubOAuth(transport, { clientId, clientSecret });
    return {
      name: PROVIDER,
      auth: { signIn: oauth, apiKey: null },
      open: (c) => ({ repos: githubRepos(githubCall(transport, c.accessToken)) }),
      revoke: (c) => oauth.revoke(c),
      ...(slug ? { manage: { url: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`, label: 'Choose repositories on GitHub' } } : {}),
    };
  },
};
