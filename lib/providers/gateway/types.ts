/* The gateway's building blocks. A provider adapter makes its raw calls through
   a Transport; the gateway wraps that Transport in layers (cache, cost log,
   limits, retries…) that know nothing about the vendor. What a call means for
   those layers comes from the adapter's policy. */

/* One raw call's answer, with what the provider charged for it. */
export type ProviderResponse<T> = { body: T; costUsd: number; status: number };

/* Makes a provider's raw calls. `Req` is the adapter's own request shape. */
export interface Transport<Req> {
  call<T>(req: Req): Promise<ProviderResponse<T>>;
}

/* A gateway layer wraps one transport in another with the same shape. */
export type Layer<Req> = (inner: Transport<Req>) => Transport<Req>;

/* What one call means to the gateway. */
export type CallInfo = {
  /* Priced per search by the provider, and counted toward users' daily search limits. */
  search: boolean;
  /* Cache key for this call (no readable request text), or null to skip the cache. */
  cacheKey: string | null;
  cacheTtlS: number;
  /* A shared slot this call must take first, for a provider's per-second limit. */
  pace?: { key: string; intervalMs: number; maxWaitMs: number };
};

export type SpendLimits = {
  dailyAlertUsd: number;
  dailyCapUsd: number;
  /* Where an admin changes the limits, for the alert message. */
  configHint: string;
};

/* Everything the gateway needs to know about one provider. */
export type GatewayPolicy<Req> = {
  provider: string; // registry name, e.g. "openalex"
  label: string; // for logs and alerts, e.g. "OpenAlex"
  describe(req: Req): CallInfo;
  /* The most one call may cost, in dollars, reserved from the user's credits
     before it's made (default 0: only its real cost is recorded after). */
  estimateUsd?(req: Req): number;
  /* Daily spending alert and hard cap; null for providers not billed per call. */
  spend: SpendLimits | null;
  /* Calls at once, and how many may wait, before callers get "busy". */
  concurrency: number;
  maxQueue: number;
  /* Attempts in all for rate-limited (429) calls. */
  retryTries: number;
  /* The provider's overall speed limit, shared by every server instance: calls
     wait their turn, at most maxWaitMs, before callers get "busy". */
  rate?: { perSecond: number; maxWaitMs: number };
  /* Extra attempts for a call that timed out, couldn't connect or got a server
     error (5xx). Only for calls that are safe to repeat (reads); default none. */
  retryTransient?: number;
  /* Keep cached answers this many seconds past their time, to serve while the
     provider is busy or down (default 0: not kept). */
  staleS?: number;
  /* For free providers that allow so many calls a day (Unpaywall: 100,000):
     stop calling once our own cap is reached, until midnight UTC. */
  dailyCalls?: { cap: number; configHint: string };
  /* Pause calls to a provider that keeps failing (default: never paused). */
  breaker?: { failures: number; windowMs: number; cooldownMs: number };
};
