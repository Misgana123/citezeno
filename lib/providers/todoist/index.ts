import { ProviderError } from '../errors';
import { connectorPolicy, connectorTransport, type ConnectorTransport } from '../connectors/http';
import { authorizeUrl, tokenRequest, type OAuth2Client } from '../connectors/oauth';
import type { ConnectorDefinition, Task, TaskList } from '../connectors/types';

/* Todoist (API v1): projects and tasks. OAuth 2 with one scope,
   data:read_write; its tokens don't expire. An app made in Todoist's App
   Management console with {site}/api/connectors/todoist/callback as its
   OAuth redirect URL.

     TODOIST_CLIENT_ID / TODOIST_CLIENT_SECRET */

const PROVIDER = 'todoist';
const LABEL = 'Todoist';
const API = 'https://api.todoist.com/api/v1';

type TTask = { id: string; content: string; description?: string; due?: { date?: string } | null; priority?: number; checked?: boolean; project_id?: string };
type Page<T> = { results?: T[]; next_cursor?: string | null };

/* Todoist's priority 4 is its "P1" (urgent); ours is 1 for the most urgent. */
const ourPriority = (p: number | undefined) => (p && p >= 1 && p <= 4 ? ((5 - p) as 1 | 2 | 3 | 4) : null);
const theirPriority = (p: number | null | undefined) => (p ? 5 - p : undefined);

export const toTask = (t: TTask): Task => ({ id: t.id, title: t.content, notes: t.description || null, due: t.due?.date ?? null, priority: ourPriority(t.priority), done: !!t.checked, url: `https://app.todoist.com/app/task/${t.id}`, projectId: t.project_id ?? null });

export function todoistTasks(transport: ConnectorTransport, accessToken: string): TaskList {
  const call = async <T>(method: 'GET' | 'POST', path: string, args: { query?: Record<string, string | number | undefined>; json?: unknown } = {}) =>
    (await transport.call<T>({ method, url: `${API}${path}`, query: args.query, ...(args.json !== undefined ? { json: args.json } : {}), headers: { authorization: `Bearer ${accessToken}` }, ...(method === 'POST' && args.json === undefined ? { expect: 'none' as const } : {}) })).body;
  const body = (t: { title?: string; notes?: string | null; due?: string | null; priority?: 1 | 2 | 3 | 4 | null }) => ({
    ...(t.title !== undefined ? { content: t.title } : {}),
    ...(t.notes !== undefined ? { description: t.notes ?? '' } : {}),
    ...(t.due !== undefined ? (t.due ? { due_date: t.due.slice(0, 10) } : { due_string: 'no date' }) : {}),
    ...(t.priority !== undefined ? { priority: theirPriority(t.priority) ?? 1 } : {}),
  });
  const get = async (id: string) => toTask(await call<TTask>('GET', `/tasks/${encodeURIComponent(id)}`));
  return {
    listName: 'project',
    async projects() {
      const r = await call<Page<{ id: string; name: string }>>('GET', '/projects', { query: { limit: 200 } });
      return (r.results ?? []).map((p) => ({ id: p.id, name: p.name }));
    },
    async tasks({ projectId, query, limit }) {
      const n = Math.min(200, Math.max(1, limit));
      const r = query?.trim()
        ? await call<Page<TTask>>('GET', '/tasks/filter', { query: { query: `search: ${query.trim().replace(/[&|!()]/g, ' ')}`, limit: n } })
        : await call<Page<TTask>>('GET', '/tasks', { query: { project_id: projectId || undefined, limit: n } });
      return (r.results ?? []).filter((t) => !projectId || t.project_id === projectId).map(toTask);
    },
    async create(t) {
      return toTask(await call<TTask>('POST', '/tasks', { json: { ...body(t), ...(t.projectId ? { project_id: t.projectId } : {}) } }));
    },
    async update(id, t) {
      const fields = body(t);
      if (Object.keys(fields).length) await call<TTask>('POST', `/tasks/${encodeURIComponent(id)}`, { json: fields });
      if (t.done !== undefined) await call<null>('POST', `/tasks/${encodeURIComponent(id)}/${t.done ? 'close' : 'reopen'}`);
      return get(id);
    },
  };
}

export const todoistConnector: ConnectorDefinition = {
  name: PROVIDER,
  label: LABEL,
  description: 'See your projects and tasks, and turn reading lists, review gaps and reviewer comments into tasks.',
  services: ['Projects', 'Tasks'],
  capabilities: ['tasks'],
  create(env, gate) {
    const clientId = env.TODOIST_CLIENT_ID?.trim();
    const clientSecret = env.TODOIST_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    const transport = gate(connectorTransport({ provider: PROVIDER, label: LABEL }), connectorPolicy({ provider: PROVIDER, label: LABEL, env, concurrency: 4, ratePerS: 4 }));
    const c: OAuth2Client = { clientId, clientSecret, tokenUrl: 'https://todoist.com/oauth/access_token', provider: PROVIDER, label: LABEL, clientAuth: 'body' };
    return {
      name: PROVIDER,
      auth: {
        signIn: {
          type: 'oauth2',
          // Todoist has no PKCE; the state cookie still guards the round trip
          authorizeUrl: ({ state }) => authorizeUrl('https://todoist.com/oauth/authorize', { client_id: clientId, scope: 'data:read_write', state }),
          async exchange({ code }) {
            const t = await tokenRequest(transport, c, { code });
            const me = (await transport.call<{ id?: string; email?: string; full_name?: string }>({ method: 'GET', url: `${API}/user`, headers: { authorization: `Bearer ${t.access_token}` } })).body;
            if (!me.id && !me.email) throw new ProviderError('unavailable', `${LABEL} didn’t say who signed in.`, { provider: PROVIDER });
            return { accessToken: t.access_token!, account: { id: String(me.id ?? me.email), label: me.email ?? me.full_name ?? 'Todoist account' } };
          },
        },
        apiKey: null,
      },
      open: (cred) => ({ tasks: todoistTasks(transport, cred.accessToken) }),
    };
  },
};
