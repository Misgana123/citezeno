import type { ConnectorRequest, ConnectorTransport } from '../connectors/http';

/* What the Microsoft 365 adapters share: Microsoft Graph, with the user's token. */

export const PROVIDER = 'microsoft';
export const LABEL = 'Microsoft 365';
export const GRAPH = 'https://graph.microsoft.com/v1.0';

export type GraphCall = <T>(req: Omit<ConnectorRequest, 'headers' | 'url'> & { path: string; headers?: Record<string, string> }) => Promise<T>;

export function graphCall(transport: ConnectorTransport, accessToken: string): GraphCall {
  return async <T>(req: Omit<ConnectorRequest, 'headers' | 'url'> & { path: string; headers?: Record<string, string> }) => {
    const { path, ...rest } = req;
    return (await transport.call<T>({ ...rest, url: `${GRAPH}${path}`, headers: { authorization: `Bearer ${accessToken}`, ...req.headers } })).body;
  };
}

/* An ID in a Graph path. */
export const seg = (id: string) => encodeURIComponent(id);
