import { ProviderError } from '../errors';
import type { CodeRepos, Repo, RepoIssue } from '../connectors/types';
import { LABEL, PROVIDER, repoPath, type GitHubCall } from './http';

/* GitHub repositories the user let the Citezeno app see: files, code search,
   issues and pull requests, and new issues. */

type GRepo = { id: number; full_name: string; description?: string | null; private: boolean; default_branch?: string; html_url: string; updated_at?: string | null; pushed_at?: string | null };
type GIssue = { number: number; title: string; state: string; pull_request?: object; user?: { login?: string } | null; body?: string | null; html_url: string; updated_at?: string; comments?: number };
type GContent = { type: string; name: string; path: string; size?: number; html_url?: string };

/* the most a file read sends back, before the caller's own cut */
const FILE_MAX_BYTES = 2 * 1024 * 1024;
const BODY_CHARS = 4000;

const bad = (message: string) => new ProviderError('bad_request', message, { provider: PROVIDER });
const repoOf = (full: string) => {
  try {
    return repoPath(full);
  } catch (e) {
    throw bad((e as Error).message);
  }
};
const filePath = (p: string) =>
  p
    .split('/')
    .filter((s) => s && s !== '.' && s !== '..')
    .map(encodeURIComponent)
    .join('/');

const toRepo = (r: GRepo): Repo => ({ id: String(r.id), fullName: r.full_name, description: r.description ?? null, private: r.private, defaultBranch: r.default_branch ?? 'main', url: r.html_url, updatedAt: r.pushed_at ?? r.updated_at ?? null });
const toIssue = (i: GIssue): RepoIssue => ({ number: i.number, title: i.title, state: i.state === 'closed' ? 'closed' : 'open', isPullRequest: !!i.pull_request, author: i.user?.login ?? null, body: (i.body ?? '').slice(0, BODY_CHARS), url: i.html_url, updatedAt: i.updated_at ?? null, comments: i.comments ?? 0 });

export function githubRepos(call: GitHubCall): CodeRepos {
  return {
    async repos({ query, limit }) {
      const inst = await call<{ installations?: { id: number }[] }>({ method: 'GET', path: '/user/installations', query: { per_page: 20 } });
      const lists = await Promise.all((inst.installations ?? []).slice(0, 5).map((i) => call<{ repositories?: GRepo[] }>({ method: 'GET', path: `/user/installations/${i.id}/repositories`, query: { per_page: 100 } })));
      const q = query?.trim().toLowerCase();
      const seen = new Set<number>();
      return lists
        .flatMap((l) => l.repositories ?? [])
        .filter((r) => !seen.has(r.id) && seen.add(r.id) && (!q || r.full_name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)))
        .map(toRepo)
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        .slice(0, limit);
    },

    async read(repo, path, { ref, maxChars }) {
      const full = repoOf(repo);
      const p = filePath(path);
      const meta = await call<GContent | GContent[]>({ method: 'GET', path: `/repos/${full}/contents/${p}`, query: { ref: ref || undefined } });
      if (Array.isArray(meta)) {
        return { kind: 'folder', path: path || '/', entries: meta.slice(0, 300).map((e) => ({ name: e.name, path: e.path, kind: e.type === 'dir' ? 'folder' : 'file', sizeBytes: e.type === 'dir' ? null : (e.size ?? null) })) };
      }
      if (meta.type !== 'file') throw bad(`“${path}” isn’t a file or folder ${LABEL} can show.`);
      if ((meta.size ?? 0) > FILE_MAX_BYTES) throw bad(`“${meta.name}” is larger than 2 MB; read a smaller file or search its code instead.`);
      const text = await call<string>({ method: 'GET', path: `/repos/${full}/contents/${p}`, query: { ref: ref || undefined }, headers: { accept: 'application/vnd.github.raw' }, expect: 'text', maxBytes: FILE_MAX_BYTES });
      if (text.includes('\u0000')) throw bad(`“${meta.name}” is a binary file, not text.`);
      const cut = text.length > maxChars;
      return { kind: 'file', path: meta.path, text: cut ? text.slice(0, maxChars) : text, cut, url: meta.html_url ?? `https://github.com/${full}/blob/HEAD/${meta.path}` };
    },

    async search({ query, repo, limit }) {
      const q = `${query.trim()}${repo ? ` repo:${repoOf(repo)}` : ''}`;
      const r = await call<{ items?: { path: string; html_url: string; repository: { full_name: string } }[] }>({ method: 'GET', path: '/search/code', query: { q, per_page: Math.min(50, limit) } });
      return (r.items ?? []).map((i) => ({ repo: i.repository.full_name, path: i.path, url: i.html_url }));
    },

    async issues(repo, { state, query, limit }) {
      const full = repoOf(repo);
      const per_page = Math.min(50, Math.max(1, limit));
      if (query?.trim()) {
        const r = await call<{ items?: GIssue[] }>({ method: 'GET', path: '/search/issues', query: { q: `repo:${full} ${state === 'all' ? '' : `state:${state} `}${query.trim()}`, per_page } });
        return (r.items ?? []).map(toIssue);
      }
      return (await call<GIssue[]>({ method: 'GET', path: `/repos/${full}/issues`, query: { state, per_page, sort: 'updated' } })).map(toIssue);
    },

    async createIssue(repo, i) {
      return toIssue(await call<GIssue>({ method: 'POST', path: `/repos/${repoOf(repo)}/issues`, json: { title: i.title, body: i.body } }));
    },
  };
}
