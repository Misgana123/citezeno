/* What can go wrong connecting or using an app, in words for the user. */

export type ConnectorErrorCode = 'not_set_up' | 'not_connected' | 'needs_reconnect' | 'bad_request' | 'not_found' | 'denied' | 'unavailable';

export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    message: string,
    readonly connector?: string,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

/* Checked by name: in development errors can come from an older copy of the class. */
export const isConnectorError = (e: unknown): e is ConnectorError => (e as Error | null)?.name === 'ConnectorError' && typeof (e as ConnectorError).code === 'string';

export const CONNECTOR_STATUS: Record<ConnectorErrorCode, number> = { not_set_up: 503, not_connected: 409, needs_reconnect: 409, bad_request: 400, not_found: 404, denied: 403, unavailable: 503 };
