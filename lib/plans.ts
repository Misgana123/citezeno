/* The paid plans (Scholar and Lab), each billed monthly or annually.
   Which Polar product is which plan, and how many credits each one adds,
   come from environment variables, so they can change without a code change:

     POLAR_SCHOLAR_MONTHLY_PRODUCT_ID   SCHOLAR_MONTHLY_CREDITS   (default 200)
     POLAR_SCHOLAR_ANNUAL_PRODUCT_ID    SCHOLAR_ANNUAL_CREDITS    (default 12 × monthly)
     POLAR_LAB_MONTHLY_PRODUCT_ID       LAB_MONTHLY_CREDITS       (default 1000)
     POLAR_LAB_ANNUAL_PRODUCT_ID        LAB_ANNUAL_CREDITS        (default 12 × monthly)

   Prices come from Polar. Until a plan's products exist there, the pricing page
   shows it as "coming soon" at these display prices (in dollars):
     SCHOLAR_MONTHLY_PRICE (7)  SCHOLAR_ANNUAL_PRICE (67.20)  LAB_MONTHLY_PRICE (19)  LAB_ANNUAL_PRICE (182.40) Server-only values: nothing here is sent to the
   browser except through the pricing page's props. */

export type Interval = 'month' | 'year';
export type PlanKey = 'scholar' | 'lab';

export type PlanDef = {
  key: PlanKey;
  name: string;
  blurb: string;
  featured: boolean;
  /* product id and credits for each billing interval that is set up */
  products: Partial<Record<Interval, { productId: string; credits: number }>>;
};

type Env = Record<string, string | undefined>;

const PLAN_TEXT: Record<PlanKey, { name: string; blurb: string; featured: boolean; monthly: number; price: { month: number; year: number } }> = {
  scholar: { name: 'Scholar', blurb: 'For students writing essays and coursework.', featured: false, monthly: 200, price: { month: 7, year: 67.2 } },
  lab: { name: 'Lab', blurb: 'For theses, papers and anyone citing every week.', featured: true, monthly: 1000, price: { month: 19, year: 182.4 } },
};

/* A whole, positive number from the environment, or the fallback. */
function count(v: string | undefined, fallback: number) {
  const n = Number(v);
  return v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function planDefs(env: Env = process.env): PlanDef[] {
  return (Object.keys(PLAN_TEXT) as PlanKey[]).map((key) => {
    const up = key.toUpperCase();
    const t = PLAN_TEXT[key];
    const monthly = count(env[`${up}_MONTHLY_CREDITS`], t.monthly);
    const annual = count(env[`${up}_ANNUAL_CREDITS`], monthly * 12);
    const products: PlanDef['products'] = {};
    const m = env[`POLAR_${up}_MONTHLY_PRODUCT_ID`]?.trim();
    const y = env[`POLAR_${up}_ANNUAL_PRODUCT_ID`]?.trim();
    if (m) products.month = { productId: m, credits: monthly };
    if (y) products.year = { productId: y, credits: annual };
    return { key, name: t.name, blurb: t.blurb, featured: t.featured, products };
  });
}

/* The plan and interval a Polar product id belongs to, if any. */
export function planForProduct(productId: string | undefined | null, env: Env = process.env) {
  if (!productId) return null;
  for (const p of planDefs(env)) {
    for (const interval of ['month', 'year'] as Interval[]) {
      const x = p.products[interval];
      if (x && x.productId === productId) return { plan: p, interval, credits: x.credits };
    }
  }
  return null;
}

/* Credits a paid (or refunded) order is worth: the plan's credits from the
   environment, or, for any other product, its "credits" metadata as before. */
export function creditsForProduct(
  product: { id?: string | null; metadata?: Record<string, unknown> | null } | null | undefined,
  env: Env = process.env,
) {
  const hit = planForProduct(product?.id, env);
  if (hit) return hit.credits;
  const n = Number(product?.metadata?.credits);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/* ---------------------------------------------------------------- display */

export type PlanPrice = { productId: string; credits: number; price: number; currency: string };
export type PlanView = {
  key: PlanKey; name: string; blurb: string; featured: boolean; month?: PlanPrice; year?: PlanPrice; savePct: number;
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
    out.push({ key: d.key, name: d.name, blurb: d.blurb, featured: d.featured, month, year, savePct });
  }
  return out;
}

/* A dollar amount from the environment, in cents, or the fallback. */
function cents(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Math.round((v != null && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : fallback) * 100);
}

/* Both plans at their display prices, for before they're set up in Polar. */
export function previewPlanViews(env: Env = process.env): PlanView[] {
  return planDefs(env).map((d) => {
    const up = d.key.toUpperCase();
    const t = PLAN_TEXT[d.key];
    const monthly = count(env[`${up}_MONTHLY_CREDITS`], t.monthly);
    const month = { productId: '', credits: monthly, price: cents(env[`${up}_MONTHLY_PRICE`], t.price.month), currency: 'usd' };
    const year = { productId: '', credits: count(env[`${up}_ANNUAL_CREDITS`], monthly * 12), price: cents(env[`${up}_ANNUAL_PRICE`], t.price.year), currency: 'usd' };
    const savePct = Math.max(0, Math.round((1 - year.price / (month.price * 12)) * 100));
    return { key: d.key, name: d.name, blurb: d.blurb, featured: d.featured, month, year, savePct, preview: true };
  });
}

export const allPlanProductIds = (env: Env = process.env) =>
  new Set(planDefs(env).flatMap((p) => Object.values(p.products).map((x) => x!.productId)));
