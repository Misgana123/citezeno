import type { ConnectorRequest, ConnectorTransport } from '../connectors/http';

/* What the GitHub adapters share: the REST API, with the user's token. */

export const PROVIDER = 'github';
export const LABEL = 'GitHub';
export const API = 'https://api.github.com';

export type GitHubCall = <T>(req: Omit<ConnectorRequest, 'headers' | 'url'> & { path: string; headers?: Record<string, string> }) => Promise<T>;

export function githubCall(transport: ConnectorTransport, accessToken: string): GitHubCall {
  return async <T>(req: Omit<ConnectorRequest, 'headers' | 'url'> & { path: string; headers?: Record<string, string> }) => {
    const { path, ...rest } = req;
    return (await transport.call<T>({ ...rest, url: `${API}${path}`, headers: { authorization: `Bearer ${accessToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...req.headers } })).body;
  };
}

/* "owner/name", checked, for a path. */
export function repoPath(full: string): string {
  const m = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.exec(full.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/$/g, ''));
  if (!m) throw new Error(`“${full}” isn’t a repository like owner/name.`);
  return `${m[1]}/${m[2]}`;
}
