import { chatPolicy } from '../chat/http';
import type { GatewayPolicy } from '../gateway/types';
import type { Env } from '../types';

/* OpenRouter: one key for the chat models of many vendors, and embeddings.
   OPENROUTER_API_KEY, server only. Chat and embeddings share one name, so they
   share one daily AI alert and cap (AI_DAILY_ALERT_USD, AI_DAILY_CAP_USD). */

export const PROVIDER = 'openrouter';
export const LABEL = 'OpenRouter';
export const BASE = 'https://openrouter.ai/api/v1';

/* When OpenRouter keeps failing, stop waiting on it for a while: the calls fail
   at once and go to the fallback vendor (Gemini) instead. */
export const BREAKER = { failures: 3, windowMs: 60_000, cooldownMs: 30_000 };

export const openRouterKey = (env: Env) => env.OPENROUTER_API_KEY?.trim() || null;

export function openRouterPolicy<Req>(env: Env): GatewayPolicy<Req> {
  return { ...(chatPolicy(PROVIDER, LABEL, env) as unknown as GatewayPolicy<Req>), breaker: BREAKER };
}
