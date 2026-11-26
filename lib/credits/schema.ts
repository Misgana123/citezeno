/* Credit tables, run by `npm run db:migrate` (and by the tests, in a throwaway
   schema). Safe to run again; only adds what is missing.

   Credits come in lots: each grant (a plan period, a top-up pack, a promo,
   credits bought before lots existed) is its own row with an expiry date.
   Paid actions put credits on hold first (spread over lots, soonest expiry
   first), record what they really cost as line items, then settle: the real
   amount is charged and the rest of the hold released. Every change to a
   balance is also a row in credit_entry, so the history always adds up. */

export const CREDITS_SQL = `
-- One grant of credits. "remaining" still includes credits on hold; "held" is
-- the part reserved by running actions. Null "expiresAt" never expires.
create table if not exists credit_lot (
  id          bigserial   primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  source      text        not null check (source in ('plan', 'pack', 'promo', 'legacy', 'adjust')),
  amount      integer     not null check (amount > 0),
  remaining   integer     not null check (remaining >= 0),
  held        integer     not null default 0 check (held >= 0 and held <= remaining),
  "expiresAt" timestamptz,
  -- set once nothing more can come out of the lot (spent, expired or removed)
  "closedAt"  timestamptz,
  -- makes a grant idempotent: a webhook delivered twice only grants once
  ref         text        unique,
  meta        jsonb       not null default '{}'::jsonb,
  "createdAt" timestamptz not null default now()
);
create index if not exists credit_lot_open on credit_lot ("userId", "expiresAt") where "closedAt" is null;
create index if not exists credit_lot_due on credit_lot ("expiresAt") where "closedAt" is null and "expiresAt" is not null;

-- One paid thing a user did (a trace, a reader summary, an assistant reply...).
create table if not exists credit_action (
  id           text             primary key,
  "userId"     text             not null references "user"(id) on delete cascade,
  kind         text             not null,
  status       text             not null default 'held' check (status in ('held', 'settled')),
  held         integer          not null default 0 check (held >= 0),
  charged      integer          not null default 0 check (charged >= 0),
  -- the real cost of the steps that succeeded, in dollars
  "costUsd"    double precision not null default 0,
  -- what a hold that's never settled is charged when it times out:
  -- 'full' (the browser never reported back) or 'metered' (its recorded line items)
  "onTimeout"  text             not null default 'metered' check ("onTimeout" in ('full', 'metered')),
  -- how it ended: finished, stopped, failed, timeout...
  outcome      text,
  meta         jsonb            not null default '{}'::jsonb,
  "createdAt"  timestamptz      not null default now(),
  "expiresAt"  timestamptz      not null,
  "settledAt"  timestamptz
);
create index if not exists credit_action_user_time on credit_action ("userId", "createdAt" desc);
create index if not exists credit_action_due on credit_action ("expiresAt") where status = 'held';

-- Which lots an action's hold came from (soonest expiry first).
create table if not exists credit_hold (
  "actionId"  text    not null references credit_action(id) on delete cascade,
  "lotId"     bigint  not null references credit_lot(id) on delete cascade,
  amount      integer not null check (amount > 0),
  primary key ("actionId", "lotId")
);

-- Every step inside an action that cost (or could have cost) money.
create table if not exists credit_line_item (
  id          bigserial        primary key,
  "actionId"  text             not null references credit_action(id) on delete cascade,
  -- model, web_search, code, papers, embed...
  kind        text             not null,
  provider    text             not null default '',
  label       text             not null default '',
  units       jsonb            not null default '{}'::jsonb,
  "costUsd"   double precision not null default 0,
  ok          boolean          not null default true,
  "createdAt" timestamptz      not null default now()
);
create index if not exists credit_line_item_action on credit_line_item ("actionId", id);

-- Every change to a balance: grant, charge, expire, remove (payment refund), adjust.
create table if not exists credit_entry (
  id          bigserial   primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  delta       integer     not null,
  kind        text        not null check (kind in ('grant', 'charge', 'expire', 'remove', 'adjust')),
  "lotId"     bigint      references credit_lot(id) on delete set null,
  "actionId"  text        references credit_action(id) on delete set null,
  reason      text        not null,
  ref         text        unique,
  meta        jsonb       not null default '{}'::jsonb
);
create index if not exists credit_entry_user_time on credit_entry ("userId", "createdAt" desc);

-- when the user was told a lot is about to expire (top-ups and gifts, 7 days before)
alter table credit_lot add column if not exists "warnedAt" timestamptz;

-- Each user's plan, kept in step with their Polar subscription. No row (or an
-- ended one) means no plan.
create table if not exists credit_plan (
  "userId"            text        primary key references "user"(id) on delete cascade,
  plan                text        not null check (plan in ('starter', 'scholar', 'lab')),
  "interval"          text        not null check ("interval" in ('month', 'year')),
  -- Polar's status: active, trialing, past_due, canceled, unpaid, incomplete, revoked...
  status              text        not null,
  "subscriptionId"    text        not null unique,
  "productId"         text        not null,
  "periodStart"       timestamptz,
  "periodEnd"         timestamptz,
  "cancelAtPeriodEnd" boolean     not null default false,
  -- annual plans add their credits monthly: the order paying for this year,
  -- how many monthly slices it has added, and when the next one is due
  "yearOrderId"       text,
  "slicesGranted"     integer     not null default 0,
  "nextSliceAt"       timestamptz,
  "updatedAt"         timestamptz not null default now()
);
create index if not exists credit_plan_slices on credit_plan ("nextSliceAt") where "nextSliceAt" is not null;

-- The daily credit checks, run once per UTC day (their findings, for the admin page).
create table if not exists credit_check (
  day         text        primary key,
  "createdAt" timestamptz not null default now(),
  findings    jsonb       not null default '{}'::jsonb
);
`;

/* Carry balances over from the old two-number wallet (credit_balance): bought
   credits become a legacy lot that never expires (they were sold that way);
   this month's free credits become a lot that expires at the end of the month.
   Runs after CREDITS_SQL; safe to run again (the refs make it a no-op). */
export const CREDITS_CARRY_OVER_SQL = `
do $$
begin
  if to_regclass('credit_balance') is null then return; end if;
  with ins as (
    insert into credit_lot ("userId", source, amount, remaining, ref, meta)
      select "userId", 'legacy', paid, paid, 'legacy:' || "userId", '{"note":"Credits bought before lots"}'::jsonb
      from credit_balance where paid > 0
      on conflict (ref) do nothing
      returning id, "userId", amount
  )
  insert into credit_entry ("userId", delta, kind, "lotId", reason, ref)
    select "userId", amount, 'grant', id, 'legacy', 'grant:legacy:' || "userId" from ins
    on conflict (ref) do nothing;
  with ins as (
    insert into credit_lot ("userId", source, amount, remaining, "expiresAt", ref, meta)
      select "userId", 'promo', free, free, date_trunc('month', now() at time zone 'utc') at time zone 'utc' + interval '1 month',
             'legacy-free:' || "userId" || ':' || "freeMonth", '{"note":"Last free monthly credits"}'::jsonb
      from credit_balance where free > 0 and "freeMonth" = to_char(now() at time zone 'utc', 'YYYY-MM')
      on conflict (ref) do nothing
      returning id, "userId", amount, ref
  )
  insert into credit_entry ("userId", delta, kind, "lotId", reason, ref)
    select "userId", amount, 'grant', id, 'legacy-free', 'grant:' || ref from ins
    on conflict (ref) do nothing;
end $$;
`;

