import { ProviderError } from '../errors';
import type { ConnectorTransport, QueryParams } from '../connectors/http';
import { ConnectorAuthError } from '../connectors/types';

/* What the Slack adapters share. Slack answers 200 with { ok: false, error }
   for most failures, so every answer is checked here. */

export const PROVIDER = 'slack';
export const LABEL = 'Slack';
export const API = 'https://slack.com/api';

const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive', 'no_permission', 'missing_scope']);

export function slackError(error: string | undefined): Error {
  const e = error ?? 'unknown_error';
  if (e === 'missing_scope' || e === 'no_permission') return new ProviderError('bad_request', `${LABEL} didn’t allow this (${e}). Connect Slack again to grant it.`, { provider: PROVIDER, reason: e });
  if (AUTH_ERRORS.has(e)) return new ConnectorAuthError(PROVIDER, `${LABEL} no longer accepts this connection.`);
  if (e === 'ratelimited') return new ProviderError('busy', `${LABEL} is rate limiting requests. Try again in a minute.`, { provider: PROVIDER, reason: e });
  if (e === 'channel_not_found' || e === 'thread_not_found' || e === 'message_not_found') return new ProviderError('not_found', `${LABEL} couldn’t find that channel or message.`, { provider: PROVIDER, reason: e });
  if (e === 'not_in_channel' || e === 'is_archived' || e === 'restricted_action') return new ProviderError('bad_request', `${LABEL} didn’t allow this: ${e.replace(/_/g, ' ')}.`, { provider: PROVIDER, reason: e });
  return new ProviderError('bad_request', `${LABEL} couldn’t do this (${e}).`, { provider: PROVIDER, reason: e });
}

export type SlackCall = <T extends object>(method: string, args?: { query?: QueryParams; json?: unknown }) => Promise<T>;

export function slackCall(transport: ConnectorTransport, accessToken: string): SlackCall {
  return async <T extends object>(method: string, args: { query?: QueryParams; json?: unknown } = {}) => {
    const { body } = await transport.call<T & { ok?: boolean; error?: string }>({
      method: args.json !== undefined ? 'POST' : 'GET',
      url: `${API}/${method}`,
      query: args.query,
      ...(args.json !== undefined ? { json: args.json } : {}),
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!body.ok) throw slackError(body.error);
    return body;
  };
}

/* The app's markdown-ish text as Slack's mrkdwn: &, <, > escaped, **bold** → *bold*, [text](url) → <url|text>. */
export function toMrkdwn(text: string): string {
  const links: string[] = [];
  const kept = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t: string, u: string) => {
    links.push(`<${u.replace(/[<>|]/g, '')}|${t.replace(/[&<>|]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '|': '¦' })[c]!)}>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  return kept
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}
