import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { runTool } from '@/lib/agent/tools/run';
import { toReadingTask } from '@/lib/connectors/service/send-shelf';
import type { Capability, TaskList } from '@/lib/providers/connectors/types';
import { linearConnector } from '@/lib/providers/linear';
import { todoistConnector } from '@/lib/providers/todoist';
import type { ExportRow } from '@/lib/shelf/export/types';
import { buildWith, cred, fakeVendor, ok } from './fake-http';

const TD = { TODOIST_CLIENT_ID: 'tid', TODOIST_CLIENT_SECRET: 'ts' };
const LN = { LINEAR_CLIENT_ID: 'lid', LINEAR_CLIENT_SECRET: 'ls' };

describe('Todoist', () => {
  it('signs in with one scope and names the account', async () => {
    const f = fakeVendor({ 'POST todoist.com/oauth/access_token': () => ok({ access_token: 'tt', token_type: 'Bearer' }), 'GET api.todoist.com/api/v1/user': () => ok({ id: '9', email: 'ada@x.com' }) });
    const s = buildWith(todoistConnector, f.doFetch, TD).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    expect(new URL(s.authorizeUrl({ state: 'st', redirectUri: 'r', codeChallenge: 'c' })).searchParams.get('scope')).toBe('data:read_write');
    expect(await s.exchange({ code: 'c', redirectUri: 'r', codeVerifier: 'v' })).toMatchObject({ accessToken: 'tt', account: { id: '9', label: 'ada@x.com' } });
  });

  it('maps priority both ways (its 4 is our 1), creates and completes tasks', async () => {
    const f = fakeVendor({
      'GET api.todoist.com/api/v1/projects': () => ok({ results: [{ id: 'p1', name: 'Inbox' }] }),
      'GET api.todoist.com/api/v1/tasks/filter': () => ok({ results: [{ id: 't9', content: 'Read X', priority: 1 }] }),
      'POST api.todoist.com/api/v1/tasks/t1/close': () => new Response(null, { status: 204 }),
      'GET api.todoist.com/api/v1/tasks/t1': () => ok({ id: 't1', content: 'Read', priority: 4, checked: true }),
      'POST api.todoist.com/api/v1/tasks': (s) => ok({ id: 't1', ...(s.json() as object), priority: (s.json() as { priority: number }).priority }),
    });
    const tasks = buildWith(todoistConnector, f.doFetch, TD).open(cred).tasks!;
    expect(tasks.listName).toBe('project');
    const t = await tasks.create({ projectId: 'p1', title: 'Read', notes: 'doi', due: '2026-12-05', priority: 1 });
    expect(f.seen.at(-1)!.json()).toEqual({ content: 'Read', description: 'doi', due_date: '2026-12-05', priority: 4, project_id: 'p1' });
    expect(t).toMatchObject({ id: 't1', priority: 1, url: 'https://app.todoist.com/app/task/t1' });
    expect(await tasks.update('t1', { done: true })).toMatchObject({ done: true });
    expect(f.seen.some((s) => s.url.pathname.endsWith('/tasks/t1/close'))).toBe(true);
    expect((await tasks.tasks({ query: 'X (draft)', limit: 5 }))[0]).toMatchObject({ priority: 4 });
    expect(f.seen.at(-1)!.url.searchParams.get('query')).toBe('search: X  draft ');
  });
});

describe('Linear', () => {
  it('signs in with PKCE and read,write scopes', async () => {
    const f = fakeVendor({ 'POST api.linear.app/oauth/token': () => ok({ access_token: 'lt', refresh_token: 'lr', expires_in: 86399 }), 'POST api.linear.app/graphql': () => ok({ data: { viewer: { id: 'v1', email: 'ada@x.com' } } }) });
    const s = buildWith(linearConnector, f.doFetch, LN).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    const u = new URL(s.authorizeUrl({ state: 'st', redirectUri: 'r', codeChallenge: 'cc' }));
    expect(u.searchParams.get('scope')).toBe('read,write');
    expect(u.searchParams.get('code_challenge')).toBe('cc');
    expect(await s.exchange({ code: 'c', redirectUri: 'r', codeVerifier: 'v'.repeat(43) })).toMatchObject({ accessToken: 'lt', refreshToken: 'lr', account: { id: 'v1', label: 'ada@x.com' } });
  });

  it('creates issues in the first team by default, completes them via a completed state, maps GraphQL errors', async () => {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const f = fakeVendor({
      'POST api.linear.app/graphql': (s) => {
        const b = s.json() as { query: string; variables: Record<string, unknown> };
        calls.push(b);
        if (b.query.includes('teams(')) return ok({ data: { teams: { nodes: [{ id: 'T1', name: 'Lab', key: 'LAB' }] } } });
        if (b.query.includes('issueCreate')) return ok({ data: { issueCreate: { success: true, issue: { id: 'i1', identifier: 'LAB-1', title: 'Read', priority: 2, team: { id: 'T1' }, url: 'https://linear.app/i1' } } } });
        if (b.query.includes('states')) return ok({ data: { team: { states: { nodes: [{ id: 's-done', type: 'completed', position: 3 }, { id: 's-todo', type: 'unstarted', position: 1 }] } } } });
        if (b.query.includes('issue(id')) return ok({ data: { issue: { id: 'i1', title: 'Read', team: { id: 'T1' } } } });
        if (b.query.includes('issueUpdate')) return ok({ data: { issueUpdate: { success: true, issue: { id: 'i1', title: 'Read', completedAt: '2026-12-01', team: { id: 'T1' } } } } });
        if (b.query.includes('issues(')) return ok({ errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }] });
        return ok({ errors: [{ message: 'nope' }] });
      },
    });
    const tasks: TaskList = buildWith(linearConnector, f.doFetch, LN).open(cred).tasks!;
    expect(tasks.listName).toBe('team');
    expect(await tasks.create({ title: 'Read', priority: 2 })).toMatchObject({ title: 'LAB-1 Read', priority: 2, projectId: 'T1' });
    expect(calls.find((c) => c.query.includes('issueCreate'))!.variables.input).toMatchObject({ teamId: 'T1', title: 'Read', priority: 2 });
    expect(await tasks.update('i1', { done: true })).toMatchObject({ done: true });
    expect(calls.find((c) => c.query.includes('issueUpdate'))!.variables.input).toEqual({ stateId: 's-done' });
    await expect(tasks.tasks({ limit: 5 })).rejects.toMatchObject({ name: 'ConnectorAuthError' });
  });
});

describe('reading lists and task tools', () => {
  it('makes a reading task per paper with its link', () => {
    const row = { item: { paper: { title: 'Sleep and memory', year: 2021, doi: '10.1/x', source: 'Nature', landingUrl: null, authors: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] } } } as unknown as ExportRow;
    expect(toReadingTask(row)).toEqual({ title: 'Read: Sleep and memory (2021)', notes: 'A, B, C et al.\nNature\nhttps://doi.org/10.1/x' });
  });

  it('asks before adding tasks, naming how many, where and in which app', async () => {
    const made: unknown[] = [];
    const tasks = { listName: 'project', create: async (t: { title: string }) => (made.push(t), { id: String(made.length), title: t.title, notes: null, due: null, priority: null, done: false, url: null, projectId: null }) } as unknown as TaskList;
    const ctx = { userId: 'u', connectors: { connected: new Map([['tasks' as Capability, { name: 'todoist', label: 'Todoist' }]]), open: async () => ({ api: tasks, connector: 'todoist', label: 'Todoist' }) } } as unknown as AgentContext;
    const input = { projectName: 'Thesis', tasks: [{ title: 'Read A' }, { title: 'Read B' }] };
    expect((await runTool(ctx, 'task_create', input)).outcome).toMatchObject({ status: 'needs_confirmation', question: 'Add 2 tasks (“Read A”, “Read B”) to Thesis in Todoist?' });
    expect((await runTool(ctx, 'task_create', input, { confirmed: true })).outcome).toMatchObject({ status: 'done', output: { result: { added: [{ title: 'Read A' }, { title: 'Read B' }] } } });
    expect((await runTool(ctx, 'task_update', { taskId: '1', taskTitle: 'Read A', done: true })).outcome).toMatchObject({ status: 'needs_confirmation', question: 'Mark “Read A” done in Todoist?' });
  });
});
