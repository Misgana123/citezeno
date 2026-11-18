/* OpenAlex budgets and our daily limits reset at midnight UTC. */

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export function nextUtcMidnight(now: number): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}
