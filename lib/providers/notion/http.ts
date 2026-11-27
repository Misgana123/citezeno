import type { ConnectorRequest, ConnectorTransport } from '../connectors/http';

export const PROVIDER = 'notion';
export const LABEL = 'Notion';
export const API = 'https://api.notion.com/v1';
/* The API version every call states (databases as tables of pages). */
export const NOTION_VERSION = '2022-06-28';

export type NotionCall = <T>(req: Omit<ConnectorRequest, 'url' | 'headers'> & { path: string }) => Promise<T>;

export function notionCall(transport: ConnectorTransport, accessToken: string): NotionCall {
  return async <T>({ path, ...req }: Omit<ConnectorRequest, 'url' | 'headers'> & { path: string }) =>
    (await transport.call<T>({ ...req, url: `${API}${path}`, headers: { authorization: `Bearer ${accessToken}`, 'notion-version': NOTION_VERSION } })).body;
}
