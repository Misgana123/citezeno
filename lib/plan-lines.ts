import { PLANS, type PlanKey } from './plans';

/* Plain-words views of a plan's limits (lib/plans.ts), shared by the pricing
   page's plan cards and the landing page's receipt so both always agree. */

export const sizeLabel = (bytes: number) => (bytes >= 1024 ** 3 ? `${Math.round(bytes / 1024 ** 3)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
export const everyLabel = (days: number | null) => (days == null ? null : days <= 1 ? 'daily' : days <= 7 ? 'weekly' : 'monthly');

/* Which assistant models a plan can use, in a few words. */
export function modelsLabel(key: PlanKey) {
  const l = PLANS[key].limits;
  if (l.tiers.includes('premium')) return 'every model, Premium too';
  return l.defaultTier === 'standard' ? 'Standard by default' : 'Economy + Standard';
}

/* The receipt's line items for one plan: [label, value]. */
export function receiptLines(key: PlanKey, monthlyCredits: number): [string, string][] {
  const l = PLANS[key].limits;
  return [
    ['Credits / month', monthlyCredits.toLocaleString('en-US')],
    ['Models', modelsLabel(key)],
    ['Deep research', l.researchBudgetCap ? `up to ${l.researchBudgetCap} credits a run` : 'not included'],
    ['Web searches / reply', String(l.webSearchesPerReply)],
    ['Shelf', `${l.shelfPapers.toLocaleString('en-US')} papers`],
    ['PDF storage', sizeLabel(l.pdfStorageBytes)],
    ['Exports & share links', 'free'],
  ];
}
