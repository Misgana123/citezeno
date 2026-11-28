import { ProviderError } from '../errors';
import { connectorPolicy, connectorTransport, type ConnectorTransport } from '../connectors/http';
import { authorizeUrl, expiresAt, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import { ConnectorAuthError, type ConnectorDefinition, type Credentials, type Task, type TaskList } from '../connectors/types';

/* Linear (GraphQL): teams and issues, as tasks. OAuth 2 with PKCE, scopes
   read and write. An OAuth app made in Linear's settings (API → OAuth
   applications) with {site}/api/connectors/linear/callback as its callback URL.

     LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET */

const PROVIDER = 'linear';
const LABEL = 'Linear';
const GRAPHQL = 'https://api.linear.app/graphql';

type LIssue = { id: string; identifier?: string; title: string; description?: string | null; priority?: number; dueDate?: string | null; url?: string; completedAt?: string | null; canceledAt?: string | null; team?: { id: string } };
const ISSUE = 'id identifier title description priority dueDate url completedAt canceledAt team { id }';

/* Linear's priority: 0 none, 1 urgent … 4 low (the same as ours). */
export const toTask = (i: LIssue): Task => ({
  id: i.id,
  title: i.identifier ? `${i.identifier} ${i.title}` : i.title,
  notes: i.description || null,
  due: i.dueDate ?? null,
  priority: i.priority && i.priority >= 1 && i.priority <= 4 ? (i.priority as 1 | 2 | 3 | 4) : null,
  done: !!(i.completedAt || i.canceledAt),
  url: i.url ?? null,
  projectId: i.team?.id ?? null,
});

export function linearTasks(transport: ConnectorTransport, accessToken: string): TaskList {
  const gql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
    const { body } = await transport.call<{ data?: T; errors?: { message?: string; extensions?: { code?: string; type?: string } }[] }>({ method: 'POST', url: GRAPHQL, json: { query, variables }, headers: { authorization: `Bearer ${accessToken}` } });
    const err = body.errors?.[0];
    if (err) {
      if (/AUTHENTICATION/i.test(err.extensions?.code ?? err.extensions?.type ?? '')) throw new ConnectorAuthError(PROVIDER, `${LABEL} no longer accepts this connection.`);
      throw new ProviderError('bad_request', `${LABEL} couldn’t do this: ${err.message ?? 'unknown error'}`, { provider: PROVIDER });
    }
    return body.data as T;
  };
  const stateOf = async (teamId: string, done: boolean) => {
    const r = await gql<{ team: { states: { nodes: { id: string; type: string; position: number }[] } } }>(`query($id: String!) { team(id: $id) { states { nodes { id type position } } } }`, { id: teamId });
    const want = done ? ['completed'] : ['unstarted', 'backlog'];
    return r.team.states.nodes.filter((s) => want.includes(s.type)).sort((a, b) => a.position - b.position)[0]?.id;
  };
  const fields = (t: { title?: string; notes?: string | null; due?: string | null; priority?: 1 | 2 | 3 | 4 | null }) => ({
    ...(t.title !== undefined ? { title: t.title.replace(/^[A-Z]{1,10}-\d+\s+/, '') } : {}),
    ...(t.notes !== undefined ? { description: t.notes ?? '' } : {}),
    ...(t.due !== undefined ? { dueDate: t.due ? t.due.slice(0, 10) : null } : {}),
    ...(t.priority !== undefined ? { priority: t.priority ?? 0 } : {}),
  });
  const projects = async () => {
    const r = await gql<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(`{ teams(first: 50) { nodes { id name key } } }`);
    return r.teams.nodes.map((t) => ({ id: t.id, name: `${t.name} (${t.key})` }));
  };
  return {
    listName: 'team',
    projects,
    async tasks({ projectId, query, includeDone, limit }) {
      const filter: Record<string, unknown> = {
        ...(projectId ? { team: { id: { eq: projectId } } } : {}),
        ...(includeDone ? {} : { state: { type: { nin: ['completed', 'canceled'] } } }),
        ...(query?.trim() ? { title: { containsIgnoreCase: query.trim() } } : {}),
      };
      const r = await gql<{ issues: { nodes: LIssue[] } }>(`query($n: Int!, $f: IssueFilter) { issues(first: $n, filter: $f, orderBy: updatedAt) { nodes { ${ISSUE} } } }`, { n: Math.min(100, Math.max(1, limit)), f: filter });
      return r.issues.nodes.map(toTask);
    },
    async create(t) {
      const teamId = t.projectId || (await projects())[0]?.id;
      if (!teamId) throw new ProviderError('bad_request', `There is no ${LABEL} team to add the issue to.`, { provider: PROVIDER });
      const r = await gql<{ issueCreate: { success: boolean; issue: LIssue } }>(`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE} } } }`, { input: { teamId, ...fields(t) } });
      return toTask(r.issueCreate.issue);
    },
    async update(id, t) {
      const input: Record<string, unknown> = fields(t);
      if (t.done !== undefined) {
        const cur = await gql<{ issue: LIssue }>(`query($id: String!) { issue(id: $id) { ${ISSUE} } }`, { id });
        const stateId = cur.issue.team ? await stateOf(cur.issue.team.id, t.done) : undefined;
        if (stateId) input.stateId = stateId;
      }
      const r = await gql<{ issueUpdate: { success: boolean; issue: LIssue } }>(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE} } } }`, { id, input });
      return toTask(r.issueUpdate.issue);
    },
  };
}

export const linearConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'See your teams’ issues, and turn reading lists, review gaps and reviewer comments into issues.',
  services: ['Teams', 'Issues'],
  capabilities: ['tasks'],
  create(env, gate) {
    const clientId = env.LINEAR_CLIENT_ID?.trim();
    const clientSecret = env.LINEAR_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 4 }));
    const c: OAuth2Client = { clientId, clientSecret, tokenUrl: 'https://api.linear.app/oauth/token', provider: PROVIDER, label: LABEL, clientAuth: 'body' };
    const viewer = async (token: string) => {
      const { body } = await transport.call<{ data?: { viewer?: { id: string; name?: string; email?: string } } }>({ method: 'POST', url: GRAPHQL, json: { query: '{ viewer { id name email } }' }, headers: { authorization: `Bearer ${token}` } });
      return body.data?.viewer;
    };
    return {
      name: PROVIDER,
      auth: {
        signIn: {
          type: 'oauth2',
          authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
            authorizeUrl('https://linear.app/oauth/authorize', { client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'read,write', state, prompt: 'consent', code_challenge: codeChallenge, code_challenge_method: 'S256' }),
          async exchange({ code, redirectUri, codeVerifier }) {
            const t = await tokenRequest(transport, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier });
            const me = await viewer(t.access_token!);
            return { accessToken: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: expiresAt(t.expires_in), account: { id: me?.id ?? 'linear', label: me?.email ?? me?.name ?? 'Linear account' } };
          },
          async refresh(cred: Credentials) {
            const t = await tokenRequest(transport, c, { grant_type: 'refresh_token', refresh_token: cred.refreshToken ?? '' });
            return { ...cred, accessToken: t.access_token!, refreshToken: t.refresh_token ?? cred.refreshToken, expiresAt: expiresAt(t.expires_in) };
          },
        },
        apiKey: null,
      },
      open: (cred) => ({ tasks: linearTasks(transport, cred.accessToken) }),
      revoke: async (cred) => {
        await transport.call({ method: 'POST', url: 'https://api.linear.app/oauth/revoke', headers: { authorization: `Bearer ${cred.accessToken}` }, expect: 'none' });
      },
    };
  },
};
