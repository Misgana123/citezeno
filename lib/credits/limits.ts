import type { PapersConfig } from '@/lib/papers/config';
import { NO_PLAN, type Limits } from '@/lib/plans';
import type { ShelfConfig } from '@/lib/shelf/config';
import { billing } from './server';
import type { Guard } from './wallet';

/* The user's plan limits as the features already know them: each feature's
   settings (shelf, Find Papers) with the plan's numbers in place of the
   app-wide defaults, so the existing checks and messages enforce the plan. */

export const planLimits = async (userId: string): Promise<Limits> => (await billing().currentPlan(userId))?.limits ?? NO_PLAN;

export const shelfConfigFor = (base: ShelfConfig, l: Limits): ShelfConfig => ({
  ...base,
  pdfMaxBytes: l.pdfMaxBytes,
  storageBytesPerUser: l.pdfStorageBytes,
  uploadsPerDay: l.uploadsPerDay,
  maxItems: l.shelfPapers,
});

export const papersConfigFor = (base: PapersConfig, l: Limits): PapersConfig => ({ ...base, dailySearchesPerUser: l.searchesPerDay });

/* The plan's limits on paid actions at once and credits spent a day. */
export const guardFor = (l: Limits): Guard => ({ concurrent: l.concurrentActions, dailySpend: l.dailySpendCap });
