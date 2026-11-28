import { checkout, polar, portal, webhooks } from '@polar-sh/better-auth';
import { createPolarCore } from '@polar-sh/sdk/2026-10';
import { listProducts } from '@polar-sh/sdk/2026-10/services/products';
import type { OrderLike, SubscriptionLike } from './credits/billing';
import { billing } from './credits/server';
import { allPackProductIds, allPlanProductIds, packDefs, planDefs, planViews, type PlanView } from './plans';
import { siteURL } from './site';

/* Polar handles payments; Citezeno keeps plans and credits itself
   (lib/credits/billing.ts). Which product is which plan or top-up comes from
   the environment (lib/plans.ts). Leave POLAR_ACCESS_TOKEN unset and billing
   is switched off: the pricing page shows the plans as "coming soon". */

export const polarEnabled = Boolean(process.env.POLAR_ACCESS_TOKEN);
export const polarServer = process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';

export const polarClient = polarEnabled
  ? createPolarCore({ accessToken: process.env.POLAR_ACCESS_TOKEN!, environment: polarServer })
  : null;

/* Webhooks go to lib/credits/billing.ts, which keeps each user's plan and adds
   or removes credits. A failure is thrown so Polar retries the delivery; every
   grant is idempotent, so a retry never adds credits twice. */
const hook = (name: string, fn: (data: never) => Promise<unknown>) => async (p: { data: unknown }) => {
  try {
    await fn(p.data as never);
  } catch (e) {
    console.error(`[citezeno] Polar ${name} webhook failed`, e);
    throw e;
  }
};

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
      portal({ returnUrl: `${siteURL}/app/chat?settings=usage` }),
      ...(process.env.POLAR_WEBHOOK_SECRET
        ? [
            webhooks({
              secret: process.env.POLAR_WEBHOOK_SECRET,
              onOrderPaid: hook('order.paid', (o: OrderLike) => billing().onOrderPaid(o)),
              onOrderRefunded: hook('order.refunded', (o: OrderLike) => billing().onOrderRefunded(o)),
              onSubscriptionCreated: hook('subscription.created', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionActive: hook('subscription.active', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionUpdated: hook('subscription.updated', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionCanceled: hook('subscription.canceled', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionUncanceled: hook('subscription.uncanceled', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionRevoked: hook('subscription.revoked', (x: SubscriptionLike) => billing().onSubscription(x)),
              onSubscriptionPastDue: hook('subscription.past_due', (x: SubscriptionLike) => billing().onSubscription(x)),
            }),
          ]
        : []),
    ],
  });
}

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  price: number; // in the smallest currency unit (cents)
  currency: string;
};

type ProductRow = Awaited<ReturnType<ReturnType<typeof listProducts>>>['items'][number];

async function activeProducts(): Promise<ProductRow[]> {
  if (!polarClient) return [];
  const res = await listProducts(polarClient)({ is_archived: false, limit: 100 });
  return res.items;
}

const fixedPrice = (p: ProductRow) =>
  p.prices.find((x) => !x.is_archived && x.amount_type === 'fixed') as { price_amount: number; price_currency: string } | undefined;

/* What the pricing page shows: the plans (monthly and annual) and the top-ups,
   from the environment, priced by Polar. */
export async function listPricing(): Promise<{ plans: PlanView[]; packs: CreditPack[] }> {
  if (!polarClient) return { plans: [], packs: [] };
  try {
    const items = await activeProducts();
    const prices = new Map<string, { price: number; currency: string }>();
    items.forEach((p) => {
      const pr = fixedPrice(p);
      if (pr) prices.set(p.id, { price: pr.price_amount, currency: pr.price_currency });
    });
    const packs = packDefs().flatMap((p) => {
      const pr = p.productId ? prices.get(p.productId) : undefined;
      return p.productId && pr && pr.price > 0 ? [{ id: p.productId, name: p.name, credits: p.credits, price: pr.price, currency: pr.currency }] : [];
    });
    return { plans: planViews(planDefs(), prices), packs };
  } catch (e) {
    console.error('[citezeno] could not load Polar products', e);
    return { plans: [], packs: [] };
  }
}

/* Top-ups are for plan members: anyone else is pointed to a plan instead. */
export const isPackProduct = (productId: string) => allPackProductIds().has(productId);
export const isPlanProduct = (productId: string) => allPlanProductIds().has(productId);
