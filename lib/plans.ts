/* The plans (Starter, Scholar, Lab), what each one allows, and the top-up packs.

   There is no free plan. An account without a plan keeps its work and the
   always-free features (reading, exporting, styles, sharing) but can't spend
   credits it doesn't have; its limits are NO_PLAN below.

   Which Polar product is which plan or pack, and the credit amounts, come from
   environment variables so they can change without a code change (see
   .env.example):

     POLAR_{STARTER,SCHOLAR,LAB}_{MONTHLY,ANNUAL}_PRODUCT_ID
     {STARTER,SCHOLAR,LAB}_MONTHLY_CREDITS     credits added each month (700 / 1900 / 3900)
     {STARTER,SCHOLAR,LAB}_{MONTHLY,ANNUAL}_PRICE   display prices before Polar is set up
     POLAR_TOPUP_{SMALL,MEDIUM,LARGE}_PRODUCT_ID, TOPUP_*_CREDITS, TOPUP_*_PRICE

   One credit is worth $0.01 of the monthly price on every plan: bigger plans
   win on limits, models and features, never on cheaper credits. Annual plans
   cost 20% less and still add their credits one month at a time. */

export type Interval = 'month' | 'year';
export type PlanKey = 'starter' | 'scholar' | 'lab';
export const PLAN_KEYS: PlanKey[] = ['starter', 'scholar', 'lab'];

/* Model price tiers by output price per million tokens. */
export type Tier = 'economy' | 'standard' | 'premium';
export const TIER_MAX_OUTPUT_USD_PER_M: Record<Exclude<Tier, 'premium'>, number> = { economy: 3, standard: 15 };
export const tierFor = (outputUsdPerM: number): Tier =>
  outputUsdPerM <= TIER_MAX_OUTPUT_USD_PER_M.economy ? 'economy' : outputUsdPerM <= TIER_MAX_OUTPUT_USD_PER_M.standard ? 'standard' : 'premium';

/* Everything a plan limits. Sizes in bytes; null = not available on this plan. */
export type Limits = {
  searchesPerDay: number;
  uploadsPerDay: number;
  pdfMaxBytes: number;
  pdfStorageBytes: number;
  agentFilesBytes: number;
  savedTraces: number;
  shelfPapers: number;
  /* days between automatic shelf refreshes; null = off */
  shelfRefreshDays: number | null;
  embedsPerMonth: number;
  chatContextTokens: number;
  concurrentActions: number;
  replyBudgetCap: number;
  /* null = deep research not available */
  researchBudgetCap: number | null;
  webSearchesPerReply: number;
  pythonSecondsPerRun: number;
  dailySpendCap: number;
  tiers: Tier[];
  defaultTier: Tier;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const NO_PLAN: Limits = {
  searchesPerDay: 10, uploadsPerDay: 3, pdfMaxBytes: 10 * MB, pdfStorageBytes: 25 * MB, agentFilesBytes: 10 * MB, savedTraces: 10, shelfPapers: 100,
  shelfRefreshDays: null, embedsPerMonth: 2, chatContextTokens: 16_000, concurrentActions: 1, replyBudgetCap: 10, researchBudgetCap: null,
  webSearchesPerReply: 2, pythonSecondsPerRun: 30, dailySpendCap: 50, tiers: ['economy'], defaultTier: 'economy',
};

type PlanText = { name: string; blurb: string; featured: boolean; monthlyCredits: number; price: { month: number; year: number }; limits: Limits };

export const PLANS: Record<PlanKey, PlanText> = {
  starter: {
    name: 'Starter', blurb: 'For trying it out and the odd essay.', featured: false, monthlyCredits: 700, price: { month: 7, year: 68 },
    limits: {
      searchesPerDay: 50, uploadsPerDay: 20, pdfMaxBytes: 15 * MB, pdfStorageBytes: 300 * MB, agentFilesBytes: 100 * MB, savedTraces: 100, shelfPapers: 1_000,
      shelfRefreshDays: 30, embedsPerMonth: 15, chatContextTokens: 32_000, concurrentActions: 2, replyBudgetCap: 20, researchBudgetCap: 80,
      webSearchesPerReply: 4, pythonSecondsPerRun: 60, dailySpendCap: 200, tiers: ['economy', 'standard'], defaultTier: 'economy',
    },
  },
  scholar: {
    name: 'Scholar', blurb: 'For students with coursework every week.', featured: true, monthlyCredits: 1_900, price: { month: 19, year: 183 },
    limits: {
      searchesPerDay: 150, uploadsPerDay: 60, pdfMaxBytes: 30 * MB, pdfStorageBytes: 1 * GB, agentFilesBytes: 500 * MB, savedTraces: 500, shelfPapers: 5_000,
      shelfRefreshDays: 7, embedsPerMonth: 60, chatContextTokens: 100_000, concurrentActions: 4, replyBudgetCap: 60, researchBudgetCap: 250,
      webSearchesPerReply: 8, pythonSecondsPerRun: 120, dailySpendCap: 500, tiers: ['economy', 'standard'], defaultTier: 'standard',
    },
  },
  lab: {
    name: 'Lab', blurb: 'For theses, papers and research every day.', featured: false, monthlyCredits: 3_900, price: { month: 39, year: 375 },
    limits: {
      searchesPerDay: 400, uploadsPerDay: 150, pdfMaxBytes: 50 * MB, pdfStorageBytes: 5 * GB, agentFilesBytes: 2 * GB, savedTraces: 2_000, shelfPapers: 25_000,
      shelfRefreshDays: 1, embedsPerMonth: 250, chatContextTokens: 200_000, concurrentActions: 8, replyBudgetCap: 150, researchBudgetCap: 600,
      webSearchesPerReply: 15, pythonSecondsPerRun: 300, dailySpendCap: 1_200, tiers: ['economy', 'standard', 'premium'], defaultTier: 'standard',
    },
  },
};

export const limitsFor = (plan: PlanKey | null): Limits => (plan ? PLANS[plan].limits : NO_PLAN);
export const planName = (plan: PlanKey | null) => (plan ? PLANS[plan].name : 'No plan');
export const isPlanKey = (v: unknown): v is PlanKey => typeof v === 'string' && (PLAN_KEYS as string[]).includes(v);

export type PackKey = 'small' | 'medium' | 'large';
const PACKS: Record<PackKey, { name: string; credits: number; price: number }> = {
  small: { name: '500 credits', credits: 500, price: 5 },
  medium: { name: '1,000 credits', credits: 1_000, price: 10 },
  large: { name: '2,500 credits', credits: 2_500, price: 25 },
};
/* Top-up credits expire this long after purchase. */
export const PACK_EXPIRY_DAYS = 365;

type Env = Record<string, string | undefined>;

/* A whole, positive number from the environment, or the fallback. */
function count(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/* A dollar amount from the environment, in cents, or the fallback. */
function cents(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Math.round((v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback) * 100);
}

export type PlanDef = {
  key: PlanKey;
  name: string;
  blurb: string;
  featured: boolean;
  monthlyCredits: number;
  /* product id for each billing interval that is set up */
  products: Partial<Record<Interval, { productId: string; credits: number }>>;
};

export const monthlyCreditsFor = (key: PlanKey, env: Env = process.env) => count(env[`${key.toUpperCase()}_MONTHLY_CREDITS`], PLANS[key].monthlyCredits);

export function planDefs(env: Env = process.env): PlanDef[] {
  return PLAN_KEYS.map((key) => {
    const up = key.toUpperCase();
    const t = PLANS[key];
    const monthly = monthlyCreditsFor(key, env);
    const products: PlanDef['products'] = {};
    const m = env[`POLAR_${up}_MONTHLY_PRODUCT_ID`]?.trim();
    const y = env[`POLAR_${up}_ANNUAL_PRODUCT_ID`]?.trim();
    // annual plans add `monthly` every month; the year's total is shown
    if (m) products.month = { productId: m, credits: monthly };
    if (y) products.year = { productId: y, credits: monthly * 12 };
    return { key, name: t.name, blurb: t.blurb, featured: t.featured, monthlyCredits: monthly, products };
  });
}

/* The plan and interval a Polar product id belongs to, if any. */
export function planForProduct(productId: string | undefined | null, env: Env = process.env) {
  if (!productId) return null;
  for (const p of planDefs(env)) {
    for (const interval of ['month', 'year'] as Interval[]) {
      const x = p.products[interval];
      if (x && x.productId === productId) return { plan: p, interval, monthlyCredits: p.monthlyCredits };
    }
  }
  return null;
}

export type PackDef = { key: PackKey; name: string; credits: number; productId: string | null; price: number };

export function packDefs(env: Env = process.env): PackDef[] {
  return (Object.keys(PACKS) as PackKey[]).map((key) => {
    const up = key.toUpperCase();
    const p = PACKS[key];
    const credits = count(env[`TOPUP_${up}_CREDITS`], p.credits);
    return { key, name: `${credits.toLocaleString('en-US')} credits`, credits, productId: env[`POLAR_TOPUP_${up}_PRODUCT_ID`]?.trim() || null, price: cents(env[`TOPUP_${up}_PRICE`], p.price) };
  });
}

export const packForProduct = (productId: string | undefined | null, env: Env = process.env) => (productId ? (packDefs(env).find((p) => p.productId === productId) ?? null) : null);

export const allPlanProductIds = (env: Env = process.env) =>
  new Set(planDefs(env).flatMap((p) => Object.values(p.products).map((x) => x!.productId)));
export const allPackProductIds = (env: Env = process.env) => new Set(packDefs(env).flatMap((p) => (p.productId ? [p.productId] : [])));

/* ---------------------------------------------------------------- display */

export type PlanPrice = { productId: string; credits: number; price: number; currency: string };
export type PlanView = {
  key: PlanKey; name: string; blurb: string; featured: boolean; monthlyCredits: number; month?: PlanPrice; year?: PlanPrice; savePct: number;
  /* not buyable yet: shown at the display prices with a "coming soon" button */
  preview?: boolean;
};

/* Join the plans with the prices Polar returns (cents, by product id).
   A plan shows only when at least one of its products has a price. */
export function planViews(defs: PlanDef[], prices: Map<string, { price: number; currency: string }>): PlanView[] {
  const out: PlanView[] = [];
  for (const d of defs) {
    const pick = (i: Interval): PlanPrice | undefined => {
      const x = d.products[i];
      const p = x && prices.get(x.productId);
      return x && p && p.price > 0 ? { ...x, ...p } : undefined;
    };
    const month = pick('month');
    const year = pick('year');
    if (!month && !year) continue;
    const savePct = month && year ? Math.max(0, Math.round((1 - year.price / (month.price * 12)) * 100)) : 0;
    out.push({ key: d.key, name: d.name, blurb: d.blurb, featured: d.featured, monthlyCredits: d.monthlyCredits, month, year, savePct });
  }
  return out;
}

/* Every plan at its display prices, for before they're set up in Polar. */
export function previewPlanViews(env: Env = process.env): PlanView[] {
  return planDefs(env).map((d) => {
    const up = d.key.toUpperCase();
    const t = PLANS[d.key];
    const month = { productId: '', credits: d.monthlyCredits, price: cents(env[`${up}_MONTHLY_PRICE`], t.price.month), currency: 'usd' };
    const year = { productId: '', credits: d.monthlyCredits * 12, price: cents(env[`${up}_ANNUAL_PRICE`], t.price.year), currency: 'usd' };
    const savePct = Math.max(0, Math.round((1 - year.price / (month.price * 12)) * 100));
    return { key: d.key, name: d.name, blurb: d.blurb, featured: d.featured, monthlyCredits: d.monthlyCredits, month, year, savePct, preview: true };
  });
}
