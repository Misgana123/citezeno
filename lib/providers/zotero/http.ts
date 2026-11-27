import type { ConnectorRequest, ConnectorTransport } from '../connectors/http';

export const PROVIDER = 'zotero';
export const LABEL = 'Zotero';
export const API = 'https://api.zotero.org';
export const OAUTH = 'https://www.zotero.org/oauth';

export type ZoteroCall = <T>(req: Omit<ConnectorRequest, 'url' | 'headers'> & { path: string; headers?: Record<string, string> }) => Promise<T>;

export function zoteroCall(transport: ConnectorTransport, apiKey: string): ZoteroCall {
  return async <T>({ path, headers, ...req }: Omit<ConnectorRequest, 'url' | 'headers'> & { path: string; headers?: Record<string, string> }) =>
    (await transport.call<T>({ ...req, url: `${API}${path}`, headers: { 'zotero-api-version': '3', 'zotero-api-key': apiKey, ...headers } })).body;
}
