import { z } from 'zod';
import { defineTool, tally } from '../types';
import { app, appLabel, clip, READ_CHARS } from './shared';

/* The user's connected code host (GitHub): the repositories they let
   Citezeno see. Read code and data, search, read issues; open issues. */

const REPO = z.string().trim().min(3).max(200).describe('A repository as "owner/name" (from repo_list).');

export const repoList = defineTool({
  name: 'repo_list',
  description: 'List the repositories the user let Citezeno see on GitHub (recently changed first), optionally by name words. If one is missing, the user can add it under Settings → Customize → Connectors → GitHub → Choose repositories.',
  input: z.object({ query: z.string().trim().max(100).optional(), limit: z.number().int().min(1).max(100).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'repos',
  label: () => 'Looking at your repositories',
  done: () => ({ did: 'Looked at your repositories' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'repos');
    const repos = await api.repos({ query: i.query, limit: i.limit ?? 30 });
    return { result: { repos: repos.map((r) => ({ repo: r.fullName, description: r.description, private: r.private, defaultBranch: r.defaultBranch, updated: r.updatedAt, url: r.url })), ...(repos.length ? {} : { note: 'No repositories are shared with Citezeno yet: the user chooses them in Settings → Customize → Connectors → GitHub.' }) }, display: { summary: tally(repos.length, 'repository', 'repositories') } };
  },
});

export const repoReadFile = defineTool({
  name: 'repo_read_file',
  description: `Read a text file from a repository (code, README, a CSV of data…; at most ${READ_CHARS.toLocaleString('en-US')} characters), or list a folder's files (path "" for the top). Optional ref: a branch, tag or commit.`,
  input: z.object({ repo: REPO, path: z.string().trim().max(500), ref: z.string().trim().max(200).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'repos',
  label: (i) => `Reading ${i.path ? clip(i.path, 50) : 'a repository'}`,
  done: (i) => ({ did: 'Read a file in a repository', about: i.path || i.repo }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'repos');
    const r = await api.read(i.repo, i.path, { ref: i.ref, maxChars: READ_CHARS });
    if (r.kind === 'folder') return { result: { repo: i.repo, folder: r.path, entries: r.entries }, display: { summary: tally(r.entries.length, 'item') } };
    return { result: { repo: i.repo, path: r.path, text: r.text, ...(r.cut ? { cut: true } : {}), url: r.url }, display: { links: [{ title: `${i.repo}/${r.path}`, url: r.url }], summary: `${r.text.length.toLocaleString('en-US')} characters` } };
  },
});

export const repoSearch = defineTool({
  name: 'repo_search',
  description: 'Search code in the user’s repositories on GitHub (words, a function name…), optionally in one repository. Returns file paths; read them with repo_read_file.',
  input: z.object({ query: z.string().trim().min(2).max(200), repo: REPO.optional(), limit: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'repos',
  label: (i) => `Searching code for “${clip(i.query, 40)}”`,
  done: (i) => ({ did: 'Searched code', about: i.query }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'repos');
    const hits = await api.search({ query: i.query, repo: i.repo, limit: i.limit ?? 20 });
    return { result: { files: hits }, display: { summary: tally(hits.length, 'file') } };
  },
});

export const repoIssues = defineTool({
  name: 'repo_issues',
  description: 'Issues and pull requests of a repository (recently updated first): open, closed or all, optionally matching words.',
  input: z.object({ repo: REPO, state: z.enum(['open', 'closed', 'all']).optional(), query: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(50).optional() }),
  kind: 'read',
  step: 'read',
  needs: 'repos',
  label: (i) => `Reading issues in ${clip(i.repo, 40)}`,
  done: (i) => ({ did: 'Read issues', about: i.repo }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'repos');
    const issues = await api.issues(i.repo, { state: i.state ?? 'open', query: i.query, limit: i.limit ?? 20 });
    return { result: { repo: i.repo, issues: issues.map((x) => ({ ...x, body: clip(x.body, 1200) })) }, display: { summary: tally(issues.length, 'issue') } };
  },
});

export const repoCreateIssue = defineTool({
  name: 'repo_create_issue',
  description: 'Open a new issue in one of the user’s repositories on GitHub (Markdown body). Asks the user first.',
  input: z.object({ repo: REPO, title: z.string().trim().min(1).max(250), body: z.string().trim().max(20_000) }),
  kind: 'write',
  step: 'make',
  needs: 'repos',
  label: (i) => `Opening an issue in ${clip(i.repo, 40)}`,
  done: (i) => ({ did: 'Opened an issue', about: i.title }),
  confirm: (i, ctx) => `Open an issue “${clip(i.title, 80)}” in ${i.repo} on ${appLabel(ctx, 'repos', 'GitHub')}?`,
  async run(ctx, i) {
    const { api } = await app(ctx, 'repos');
    const issue = await api.createIssue(i.repo, { title: i.title, body: i.body });
    return { result: { number: issue.number, url: issue.url }, display: { links: [{ title: `#${issue.number} ${issue.title}`, url: issue.url }], summary: `Opened #${issue.number}` } };
  },
});

export const REPO_TOOLS = [repoList, repoReadFile, repoSearch, repoIssues, repoCreateIssue];
