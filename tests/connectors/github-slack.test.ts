import { describe, expect, it } from 'vitest';
import type { AgentContext } from '@/lib/agent/context';
import { runTool } from '@/lib/agent/tools/run';
import type { Capabilities, Capability } from '@/lib/providers/connectors/types';
import { githubConnector } from '@/lib/providers/github';
import { repoPath } from '@/lib/providers/github/http';
import { slackConnector } from '@/lib/providers/slack';
import { toMrkdwn } from '@/lib/providers/slack/http';
import { HISTORY_CAP, plain } from '@/lib/providers/slack/messages';
import { buildWith, cred, fakeVendor, ok } from './fake-http';

const GH = { GITHUB_APP_CLIENT_ID: 'Iv1.abc', GITHUB_APP_CLIENT_SECRET: 's', GITHUB_APP_SLUG: 'citezeno' };
const SL = { SLACK_CLIENT_ID: '1.2', SLACK_CLIENT_SECRET: 's' };

describe('GitHub', () => {
  it('is a GitHub App sign-in with PKCE, a link to choose repositories, and rotating tokens', async () => {
    const f = fakeVendor({
      'POST github.com/login/oauth/access_token': (s) => {
        const form = new URLSearchParams(String(s.body));
        if (form.get('refresh_token') === 'bad') return ok({ error: 'bad_refresh_token' });
        return ok({ access_token: form.get('grant_type') ? 'ghu_2' : 'ghu_1', refresh_token: form.get('grant_type') ? 'ghr_2' : 'ghr_1', expires_in: 28800 });
      },
      'GET api.github.com/user': () => ok({ id: 7, login: 'ada' }),
    });
    const c = buildWith(githubConnector, f.doFetch, GH);
    expect(c.manage).toEqual({ url: 'https://github.com/apps/citezeno/installations/new', label: 'Choose repositories on GitHub' });
    const s = c.auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    expect(new URL(s.authorizeUrl({ state: 'x', redirectUri: 'r', codeChallenge: 'cc' })).searchParams.get('code_challenge_method')).toBe('S256');
    const got = await s.exchange({ code: 'c', redirectUri: 'r', codeVerifier: 'v'.repeat(43) });
    expect(got).toMatchObject({ accessToken: 'ghu_1', refreshToken: 'ghr_1', account: { id: '7', label: 'ada' } });
    expect((await s.refresh!(got)).refreshToken).toBe('ghr_2');
    await expect(s.refresh!({ ...got, refreshToken: 'bad' })).rejects.toMatchObject({ name: 'ConnectorAuthError' });
  });

  it('lists repos from the app’s installations, reads text files and folders, refuses binaries and bad paths', async () => {
    const f = fakeVendor({
      'GET api.github.com/user/installations/1/repositories': () => ok({ repositories: [{ id: 1, full_name: 'ada/old', private: false, html_url: 'h1', pushed_at: '2025-01-01' }, { id: 2, full_name: 'ada/thesis', private: true, html_url: 'h2', pushed_at: '2026-11-01' }] }),
      'GET api.github.com/user/installations': () => ok({ installations: [{ id: 1 }] }),
      'GET api.github.com/repos/ada/thesis/contents/data': () => ok([{ type: 'dir', name: 'raw', path: 'data/raw' }, { type: 'file', name: 'a.csv', path: 'data/a.csv', size: 10 }]),
      'GET api.github.com/repos/ada/thesis/contents/data/a.csv': (s) => (s.headers.accept === 'application/vnd.github.raw' ? new Response('x,y\n1,2', { status: 200 }) : ok({ type: 'file', name: 'a.csv', path: 'data/a.csv', size: 7, html_url: 'https://github.com/ada/thesis/blob/main/data/a.csv' })),
      'GET api.github.com/repos/ada/thesis/contents/fig.png': (s) => (s.headers.accept === 'application/vnd.github.raw' ? new Response('\u0000PNG', { status: 200 }) : ok({ type: 'file', name: 'fig.png', path: 'fig.png', size: 4 })),
    });
    const repos = buildWith(githubConnector, f.doFetch, GH).open(cred).repos!;
    expect((await repos.repos({ limit: 10 })).map((r) => r.fullName)).toEqual(['ada/thesis', 'ada/old']);
    expect(await repos.read('ada/thesis', 'data', { maxChars: 100 })).toMatchObject({ kind: 'folder', entries: [{ kind: 'folder' }, { kind: 'file', sizeBytes: 10 }] });
    expect(await repos.read('https://github.com/ada/thesis', 'data/a.csv', { maxChars: 3 })).toMatchObject({ kind: 'file', text: 'x,y', cut: true });
    await expect(repos.read('ada/thesis', 'fig.png', { maxChars: 100 })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(repos.read('not a repo', 'x', { maxChars: 100 })).rejects.toMatchObject({ code: 'bad_request' });
    expect(() => repoPath('a/b/c')).toThrow();
  });
});

describe('Slack', () => {
  it('signs in as the user (user token), names the workspace, keeps its address for links', async () => {
    const f = fakeVendor({
      'POST slack.com/api/oauth.v2.access': () => ok({ ok: true, authed_user: { id: 'U1', access_token: 'xoxp-1', scope: 'search:read,chat:write' }, team: { id: 'T1', name: 'Lab' } }),
      'GET slack.com/api/auth.test': () => ok({ ok: true, url: 'https://lab.slack.com/', user: 'ada' }),
    });
    const s = buildWith(slackConnector, f.doFetch, SL).auth.signIn;
    if (s?.type !== 'oauth2') throw new Error('expected oauth2');
    const u = new URL(s.authorizeUrl({ state: 'x', redirectUri: 'r', codeChallenge: 'c' }));
    expect(u.searchParams.get('user_scope')).toContain('chat:write');
    expect(u.searchParams.get('scope')).toBeNull();
    expect(await s.exchange({ code: 'c', redirectUri: 'r', codeVerifier: 'v' })).toMatchObject({ accessToken: 'xoxp-1', account: { id: 'T1:U1', label: 'ada · Lab' }, meta: { teamUrl: 'https://lab.slack.com/' } });
  });

  it('turns ok:false into the right errors; a revoked token means connect again', async () => {
    const f = fakeVendor({ 'GET slack.com/api/search.messages': () => ok({ ok: false, error: 'token_revoked' }), 'GET slack.com/api/conversations.list': () => ok({ ok: false, error: 'missing_scope' }) });
    const m = buildWith(slackConnector, f.doFetch, SL).open(cred).messages!;
    await expect(m.search({ query: 'x', limit: 5 })).rejects.toMatchObject({ name: 'ConnectorAuthError' });
    await expect(m.channels({ limit: 5 })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('reads threads in pages of at most 15 and says when capped; posts mrkdwn without unfurling', async () => {
    const f = fakeVendor({
      'GET slack.com/api/conversations.replies': () => ok({ ok: true, has_more: true, messages: [{ ts: '1700000000.000100', text: 'see <https://doi.org/1|the paper>', user: 'U2' }] }),
      'GET slack.com/api/users.info': () => ok({ ok: true, user: { profile: { display_name: 'Bo' } } }),
      'POST slack.com/api/chat.postMessage': (s) => ok({ ok: true, ts: '1700000001.000200', channel: (s.json() as { channel: string }).channel }),
    });
    const m = buildWith(slackConnector, f.doFetch, SL).open({ ...cred, meta: { teamUrl: 'https://lab.slack.com/' } }).messages!;
    const t = await m.thread('C1', '1700000000.000100', 50);
    expect(f.seen[0].url.searchParams.get('limit')).toBe(String(HISTORY_CAP));
    expect(t).toMatchObject({ limited: true, messages: [{ author: 'Bo', text: 'see the paper (https://doi.org/1)', url: 'https://lab.slack.com/archives/C1/p1700000000000100' }] });
    const posted = await m.post('C1', 'A **finding** <script> & [DOI](https://doi.org/2)');
    expect(f.seen.at(-1)!.json()).toMatchObject({ channel: 'C1', text: 'A *finding* &lt;script&gt; &amp; <https://doi.org/2|DOI>', unfurl_links: false });
    expect(posted.url).toBe('https://lab.slack.com/archives/C1/p1700000001000200');
  });

  it('text helpers', () => {
    expect(toMrkdwn('# Title\n**b** [x|y](https://e.org/a)')).toBe('*Title*\n*b* <https://e.org/a|x¦y>');
    expect(plain('<#C1|lab> <@U1> &amp;')).toBe('#lab @U1 &');
  });
});

describe('GitHub and Slack tools ask before writing', () => {
  const ctx = (apis: Partial<Capabilities>) =>
    ({
      userId: 'u',
      connectors: { connected: new Map(Object.keys(apis).map((c) => [c as Capability, { name: c, label: c === 'messages' ? 'Slack' : 'GitHub' }])), open: async (cap: Capability) => ({ api: apis[cap], connector: cap, label: 'x' }) },
    }) as unknown as AgentContext;
  it('posts and opens issues only after a yes, showing where and what', async () => {
    const c = ctx({ messages: { post: async () => ({ url: 'https://slack/1' }) } as never, repos: { createIssue: async () => ({ number: 4, title: 'T', url: 'https://gh/4' }) } as never });
    expect((await runTool(c, 'chat_post', { channelId: 'C1', channelName: 'lab', text: 'Hello' })).outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringMatching(/#lab in Slack as you\?[\s\S]*Hello/) });
    expect((await runTool(c, 'chat_post', { channelId: 'C1', text: 'Hello' }, { confirmed: true })).outcome).toMatchObject({ status: 'done', output: { result: { posted: true } } });
    expect((await runTool(c, 'repo_create_issue', { repo: 'ada/thesis', title: 'Fix fig 2', body: '' })).outcome).toMatchObject({ status: 'needs_confirmation', question: expect.stringContaining('ada/thesis on GitHub') });
  });
});
