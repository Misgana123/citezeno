import { checkout, polar, portal, webhooks } from '@polar-sh/better-auth';
import { createPolarCore } from '@polar-sh/sdk/2026-10';
import { listProducts } from '@polar-sh/sdk/2026-10/services/products';
import { pool } from './db';
import { adjustPaid, creditsFor } from './credits';
import { allPlanProductIds, creditsForProduct, planDefs, planViews, type PlanView } from './plans';
import { siteURL } from './site';

/* Polar handles payments; Citezeno keeps the credit balance itself (lib/credits.ts).
   A paid order adds the plan's credits from the environment (lib/plans.ts); any
   other product adds the credits named in its metadata ("credits": 500).
   Leave POLAR_ACCESS_TOKEN unset and billing is switched off: everyone keeps the
   free monthly allowance and the pricing page shows no purchase buttons. */

export const polarEnabled = Boolean(process.env.POLAR_ACCESS_TOKEN);
export const polarServer = process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';

export const polarClient = polarEnabled
  ? createPolarCore({ accessToken: process.env.POLAR_ACCESS_TOKEN!, environment: polarServer })
  : null;

type Meta = Record<string, unknown> | null | undefined;
type OrderLike = {
  id: string;
  customer?: { external_id?: string | null } | null;
  product?: { id?: string; name?: string; metadata?: Meta } | null;
  metadata?: Meta;
  total_amount?: number;
  refunded_amount?: number;
  currency?: string;
  billing_reason?: string;
};

/* Find which user an order belongs to: the Polar customer's external ID is the Better Auth user ID. */
function userOf(o: OrderLike) {
  return o.customer?.external_id || (typeof o.metadata?.userId === 'string' ? (o.metadata.userId as string) : null);
}

async function onPaid(o: OrderLike) {
  const userId = userOf(o);
  const credits = creditsForProduct(o.product);
  if (!userId || !credits) {
    console.warn('[citezeno] Polar order ignored (no user, or the product is neither a configured plan nor has "credits" metadata)', o.id);
    return;
  }
  const added = await adjustPaid(userId, credits, 'purchase', `order:${o.id}`, {
    orderId: o.id, product: o.product?.name, amount: o.total_amount, currency: o.currency, billingReason: o.billing_reason,
  });
  if (added) console.info(`[citezeno] +${credits} credits for ${userId} (order ${o.id})`);
}

/* Refunds remove the matching share of the order's credits (never below zero). */
async function onRefunded(o: OrderLike) {
  const userId = userOf(o);
  const credits = creditsForProduct(o.product);
  if (!userId || !credits) return;
  const share = o.total_amount ? Math.min(1, (o.refunded_amount || 0) / o.total_amount) : 1;
  const target = Math.round(credits * share);
  const { rows } = await pool.query<{ done: string | null }>(
    `select -sum("paidDelta") as done from credit_ledger where "userId" = $1 and reason = 'refund' and meta->>'orderId' = $2`,
    [userId, o.id],
  );
  const remove = target - Number(rows[0]?.done || 0);
  if (remove > 0) {
    await adjustPaid(userId, -remove, 'refund', `refund:${o.id}:${o.refunded_amount}`, { orderId: o.id, product: o.product?.name });
  }
}

export function polarPlugin() {
  if (!polarClient) return null;
  return polar({
    client: polarClient,
    // Off so sign-up never depends on Polar being reachable. Checkout links the
    // buyer to the account by its user ID (external customer ID) instead.
    createCustomerOnSignUp: false,
    use: [
      checkout({
        successUrl: '/billing/success?checkout_id={CHECKOUT_ID}',
        returnUrl: `${siteURL}/pricing`,
        authenticatedUsersOnly: true,
      }),
      portal({ returnUrl: `${siteURL}/account#billing` }),
      ...(process.env.POLAR_WEBHOOK_SECRET
        ? [
            webhooks({
              secret: process.env.POLAR_WEBHOOK_SECRET,
              onOrderPaid: async (p) => onPaid(p.data as unknown as OrderLike),
              onOrderRefunded: async (p) => onRefunded(p.data as unknown as OrderLike),
            }),
          ]
        : []),
    ],
  });
}

export type CreditPack = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price: number; // in the smallest currency unit (cents)
  currency: string;
  recurring: 'month' | 'year' | null;
  featured: boolean;
};

type ProductRow = Awaited<ReturnType<ReturnType<typeof listProducts>>>['items'][number];

async function activeProducts(): Promise<ProductRow[]> {
  if (!polarClient) return [];
  const res = await listProducts(polarClient)({ is_archived: false, limit: 100 });
  return res.items;
}

const fixedPrice = (p: ProductRow) =>
  p.prices.find((x) => !x.is_archived && x.amount_type === 'fixed') as { price_amount: number; price_currency: string } | undefined;

/* What the pricing page shows: the Scholar and Lab plans (monthly and annual,
   from the environment, priced by Polar), plus any other active product that
   has "credits" metadata, as before. */
export async function listPricing(): Promise<{ plans: PlanView[]; packs: CreditPack[] }> {
  if (!polarClient) return { plans: [], packs: [] };
  try {
    const items = await activeProducts();
    const prices = new Map<string, { price: number; currency: string }>();
    items.forEach((p) => {
      const pr = fixedPrice(p);
      if (pr) prices.set(p.id, { price: pr.price_amount, currency: pr.price_currency });
    });
    const planIds = allPlanProductIds();
    const packs = items
      .filter((p) => !planIds.has(p.id))
      .map((p) => {
        const price = fixedPrice(p);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          credits: creditsFor(p.metadata),
          price: price?.price_amount ?? 0,
          currency: price?.price_currency ?? 'usd',
          recurring: p.is_recurring ? (p.recurring_interval === 'year' ? 'year' : 'month') : null,
          featured: String(p.metadata?.featured ?? '') === 'true',
        } satisfies CreditPack;
      })
      .filter((p) => p.credits > 0 && p.price > 0)
      .sort((a, b) => a.price - b.price);
    return { plans: planViews(planDefs(), prices), packs };
  } catch (e) {
    console.error('[citezeno] could not load Polar products', e);
    return { plans: [], packs: [] };
  }
}
