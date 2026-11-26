import { randomUUID } from 'node:crypto';
import { creditsForCost, LOT_LABELS, type Balance, type LedgerRow, type LotSource, type LotView } from '@/lib/pricing';
import { tx, type Db, type Queryable } from '@/lib/shelf/db';
import { CreditError, InsufficientCredits } from './errors';

/* The wallet: lots in, holds out, settle at the real cost.

   Every change for one user runs in a transaction that first takes that
   user's lock, so two tabs (or two server instances) can never spend the
   same credit twice. Credits are always taken from the lot that expires
   soonest; lots that never expire go last. */

export type Clock = () => Date;
const realClock: Clock = () => new Date();

type LotRow = { id: string; source: LotSource; amount?: number; remaining: number; held: number; expiresAt: Date | null };
type ActionRow = { id: string; userId: string; kind: string; status: 'held' | 'settled'; held: number; charged: number; costUsd: number; onTimeout: 'full' | 'metered'; expiresAt: Date; outcome: string | null; meta: Record<string, unknown> };

async function lockUser(q: Queryable, userId: string) {
  await q.query(`select pg_advisory_xact_lock(hashtext('credits:' || $1))`, [userId]);
}

const ORDER = `"expiresAt" asc nulls last, id asc`;

/* Lots that can still give credits: open and not past their expiry. */
async function liveLots(q: Queryable, userId: string, now: Date): Promise<LotRow[]> {
  const { rows } = await q.query<LotRow>(
    `select id::text, source, remaining, held, "expiresAt" from credit_lot
     where "userId" = $1 and "closedAt" is null and ("expiresAt" is null or "expiresAt" > $2) order by ${ORDER}`,
    [userId, now],
  );
  return rows;
}

async function readBalance(q: Queryable, userId: string, now: Date): Promise<Balance> {
  const { rows } = await q.query<LotRow>(
    `select id::text, source, amount, remaining, held, "expiresAt" from credit_lot where "userId" = $1 and "closedAt" is null order by ${ORDER}`,
    [userId],
  );
  let total = 0;
  let held = 0;
  const lots: LotView[] = [];
  let nextExpiry: Balance['nextExpiry'] = null;
  for (const r of rows) {
    held += r.held;
    const live = !r.expiresAt || r.expiresAt > now;
    if (!live) continue;
    const free = r.remaining - r.held;
    total += free;
    if (r.remaining > 0) lots.push({ id: r.id, source: r.source, amount: r.amount ?? r.remaining, remaining: r.remaining, held: r.held, expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null, label: LOT_LABELS[r.source] });
    if (!nextExpiry && r.expiresAt && free > 0) nextExpiry = { amount: free, at: new Date(r.expiresAt).toISOString() };
  }
  return { total, held, lots, nextExpiry };
}

/* Expire what's left of this user's lots that are past their date. Credits
   still on hold stay until their action settles; then they expire too. */
async function expireLots(q: Queryable, userId: string, now: Date) {
  const { rows } = await q.query<LotRow>(
    `select id::text, source, remaining, held, "expiresAt" from credit_lot
     where "userId" = $1 and "closedAt" is null and "expiresAt" is not null and "expiresAt" <= $2 for update`,
    [userId, now],
  );
  for (const lot of rows) {
    const gone = lot.remaining - lot.held;
    await q.query(`update credit_lot set remaining = held, "closedAt" = case when held = 0 then $2::timestamptz else null end where id = $1`, [lot.id, now]);
    if (gone > 0) {
      await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, "lotId", reason, meta) values ($1, $2, $3, 'expire', $4, 'expire', $5)`, [
        userId, now, -gone, lot.id, JSON.stringify({ source: lot.source }),
      ]);
    }
  }
}

/* Take `amount` from the user's live lots (soonest expiry first) as a hold for the action. */
async function allocate(q: Queryable, userId: string, actionId: string, amount: number, now: Date) {
  let left = amount;
  for (const lot of await liveLots(q, userId, now)) {
    if (!left) break;
    const take = Math.min(lot.remaining - lot.held, left);
    if (take <= 0) continue;
    left -= take;
    await q.query(`update credit_lot set held = held + $2 where id = $1`, [lot.id, take]);
    await q.query(
      `insert into credit_hold ("actionId", "lotId", amount) values ($1, $2, $3) on conflict ("actionId", "lotId") do update set amount = credit_hold.amount + excluded.amount`,
      [actionId, lot.id, take],
    );
  }
  await q.query(`update credit_action set held = held + $2 where id = $1`, [actionId, amount - left]);
  return amount - left;
}

export type Wallet = ReturnType<typeof createWallet>;

export function createWallet(db: Db, clock: Clock = realClock) {
  const inUser = <T>(userId: string, fn: (q: Queryable, now: Date) => Promise<T>) =>
    tx(db, async (q) => {
      await lockUser(q, userId);
      const now = clock();
      await expireLots(q, userId, now);
      return fn(q, now);
    });

  async function action(q: Queryable, actionId: string, userId?: string): Promise<ActionRow> {
    const { rows } = await q.query<ActionRow>(
      `select id, "userId", kind, status, held, charged, "costUsd", "onTimeout", "expiresAt", outcome, meta from credit_action where id = $1 ${userId ? 'and "userId" = $2' : ''} for update`,
      userId ? [actionId, userId] : [actionId],
    );
    if (!rows[0]) throw new CreditError('not_found', 'That action was not found.');
    return { ...rows[0], costUsd: Number(rows[0].costUsd) };
  }

  /* Charge `credits` (at most the hold) and release the rest, lot by lot. */
  async function closeAction(q: Queryable, a: ActionRow, credits: number, outcome: string, now: Date) {
    const charge = Math.max(0, Math.min(Math.floor(credits), a.held));
    const parts = await q.query<{ lotId: string; amount: number }>(
      `select h."lotId"::text, h.amount from credit_hold h join credit_lot l on l.id = h."lotId" where h."actionId" = $1 order by l."expiresAt" asc nulls last, l.id asc`,
      [a.id],
    );
    let left = charge;
    const used: { lot: string; n: number }[] = [];
    for (const p of parts.rows) {
      const take = Math.min(p.amount, left);
      left -= take;
      if (take) used.push({ lot: p.lotId, n: take });
      await q.query(`update credit_lot set held = held - $2, remaining = remaining - $3 where id = $1`, [p.lotId, p.amount, take]);
    }
    await q.query(`delete from credit_hold where "actionId" = $1`, [a.id]);
    // lots that are now empty can't give anything more
    await q.query(`update credit_lot set "closedAt" = $2 where "userId" = $1 and "closedAt" is null and remaining = 0`, [a.userId, now]);
    if (charge > 0) {
      await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, "actionId", reason, ref, meta) values ($1, $2, $3, 'charge', $4, $5, $6, $7)`, [
        a.userId, now, -charge, a.id, a.kind, `charge:${a.id}`, JSON.stringify({ ...a.meta, held: a.held, costUsd: a.costUsd, lots: used }),
      ]);
    }
    await q.query(`update credit_action set status = 'settled', charged = $2, outcome = $3, "settledAt" = $4 where id = $1`, [a.id, charge, outcome, now]);
    // credits released back to a lot that has since expired expire now
    await expireLots(q, a.userId, now);
    return charge;
  }

  return {
    balance: (userId: string) => inUser(userId, (q, now) => readBalance(q, userId, now)),

    /* Add a lot. `ref` makes it idempotent; returns null when it was already granted. */
    grant: (g: { userId: string; source: LotSource; amount: number; expiresAt: Date | null; ref: string; reason?: string; meta?: Record<string, unknown> }) =>
      inUser(g.userId, async (q, now) => {
        const amount = Math.floor(g.amount);
        if (amount <= 0) return null;
        const ins = await q.query<{ id: string }>(
          `insert into credit_lot ("userId", source, amount, remaining, "expiresAt", ref, meta, "createdAt") values ($1, $2, $3, $3, $4, $5, $6, $7) on conflict (ref) do nothing returning id::text`,
          [g.userId, g.source, amount, g.expiresAt, g.ref, JSON.stringify(g.meta ?? {}), now],
        );
        const lotId = ins.rows[0]?.id;
        if (!lotId) return null;
        await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, "lotId", reason, ref, meta) values ($1, $2, $3, 'grant', $4, $5, $6, $7)`, [
          g.userId, now, amount, lotId, g.reason ?? g.source, `grant:${g.ref}`, JSON.stringify(g.meta ?? {}),
        ]);
        return lotId;
      }),

    /* Take credits back out of one lot (a refunded or disputed payment): only
       what's unspent and not on hold. Idempotent by `ref`. Returns what was removed. */
    remove: (r: { userId: string; lotRef: string; amount: number; ref: string; reason: string; meta?: Record<string, unknown>; close?: boolean }) =>
      inUser(r.userId, async (q, now) => {
        const done = await q.query(`select 1 from credit_entry where ref = $1`, [r.ref]);
        if (done.rowCount) return 0;
        const { rows } = await q.query<LotRow>(`select id::text, source, remaining, held, "expiresAt" from credit_lot where ref = $1 and "userId" = $2 for update`, [r.lotRef, r.userId]);
        const lot = rows[0];
        if (!lot) return 0;
        const take = Math.max(0, Math.min(Math.floor(r.amount), lot.remaining - lot.held));
        await q.query(`update credit_lot set remaining = remaining - $2, "closedAt" = case when remaining - $2 = 0 or $3 then coalesce("closedAt", $4) else "closedAt" end where id = $1`, [
          lot.id, take, Boolean(r.close) && lot.held === 0, now,
        ]);
        await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, "lotId", reason, ref, meta) values ($1, $2, $3, 'remove', $4, $5, $6, $7)`, [
          r.userId, now, -take, lot.id, r.reason, r.ref, JSON.stringify({ ...r.meta, wanted: r.amount }),
        ]);
        return take;
      }),

    /* Admin change. Positive adds an 'adjust' lot (expiring when given); negative
       takes from the live lots, soonest expiry first. */
    adjust: (a: { userId: string; amount: number; ref: string; expiresAt?: Date | null; meta?: Record<string, unknown> }) =>
      inUser(a.userId, async (q, now) => {
        const amount = Math.trunc(a.amount);
        if (amount > 0) {
          const ins = await q.query<{ id: string }>(
            `insert into credit_lot ("userId", source, amount, remaining, "expiresAt", ref, meta, "createdAt") values ($1, 'adjust', $2, $2, $3, $4, $5, $6) on conflict (ref) do nothing returning id::text`,
            [a.userId, amount, a.expiresAt ?? null, a.ref, JSON.stringify(a.meta ?? {}), now],
          );
          if (!ins.rows[0]) return readBalance(q, a.userId, now);
          await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, "lotId", reason, ref, meta) values ($1, $2, $3, 'adjust', $4, 'adjust', $5, $6)`, [
            a.userId, now, amount, ins.rows[0].id, `adjust:${a.ref}`, JSON.stringify(a.meta ?? {}),
          ]);
        } else if (amount < 0) {
          const done = await q.query(`select 1 from credit_entry where ref = $1`, [`adjust:${a.ref}`]);
          if (done.rowCount) return readBalance(q, a.userId, now);
          let left = -amount;
          for (const lot of await liveLots(q, a.userId, now)) {
            const take = Math.min(lot.remaining - lot.held, left);
            if (take <= 0) continue;
            left -= take;
            await q.query(`update credit_lot set remaining = remaining - $2, "closedAt" = case when remaining - $2 = 0 then $3::timestamptz else null end where id = $1`, [lot.id, take, now]);
          }
          await q.query(`insert into credit_entry ("userId", "createdAt", delta, kind, reason, ref, meta) values ($1, $2, $3, 'adjust', 'adjust', $4, $5)`, [
            a.userId, now, amount + left, `adjust:${a.ref}`, JSON.stringify(a.meta ?? {}),
          ]);
        }
        return readBalance(q, a.userId, now);
      }),

    /* Put credits on hold for an action. With `min`, a smaller hold (down to
       min) is placed when the full amount doesn't fit. The same actionId
       twice returns the first hold. Throws InsufficientCredits. */
    hold: (h: { userId: string; kind: string; amount: number; min?: number; actionId?: string; ttlMs: number; onTimeout?: 'full' | 'metered'; meta?: Record<string, unknown> }) =>
      inUser(h.userId, async (q, now) => {
        const id = h.actionId ?? randomUUID();
        const seen = await q.query<{ held: number; status: string }>(`select held, status from credit_action where id = $1 and "userId" = $2`, [id, h.userId]);
        if (seen.rows[0]) return { actionId: id, held: seen.rows[0].held, balance: await readBalance(q, h.userId, now) };
        const want = Math.max(1, Math.ceil(h.amount));
        const floor = Math.max(1, Math.min(want, Math.ceil(h.min ?? want)));
        const before = await readBalance(q, h.userId, now);
        if (before.total < floor) throw new InsufficientCredits(before, want);
        await q.query(`insert into credit_action (id, "userId", kind, "onTimeout", meta, "createdAt", "expiresAt") values ($1, $2, $3, $4, $5, $6, $7)`, [
          id, h.userId, h.kind, h.onTimeout ?? 'metered', JSON.stringify(h.meta ?? {}), now, new Date(now.getTime() + h.ttlMs),
        ]);
        const held = await allocate(q, h.userId, id, Math.min(want, before.total), now);
        return { actionId: id, held, balance: await readBalance(q, h.userId, now) };
      }),

    /* Add to a running action's hold. Returns false (and holds nothing) when it doesn't fit. */
    extend: (userId: string, actionId: string, more: number, ttlMs?: number) =>
      inUser(userId, async (q, now) => {
        const a = await action(q, actionId, userId);
        if (a.status !== 'held') return false;
        const n = Math.ceil(more);
        if (n <= 0) return true;
        if ((await readBalance(q, userId, now)).total < n) return false;
        await allocate(q, userId, actionId, n, now);
        if (ttlMs) await q.query(`update credit_action set "expiresAt" = $2 where id = $1`, [actionId, new Date(now.getTime() + ttlMs)]);
        return true;
      }),

    /* Keep a long-running action's hold alive. */
    touch: async (actionId: string, ttlMs: number) => {
      await db.query(`update credit_action set "expiresAt" = $2 where id = $1 and status = 'held'`, [actionId, new Date(clock().getTime() + ttlMs)]);
    },

    /* Record a step's real cost. Failed steps are kept for reporting but never charged. */
    addLine: async (actionId: string, l: { kind: string; provider?: string; label?: string; units?: Record<string, unknown>; costUsd: number; ok?: boolean }) => {
      const ok = l.ok !== false;
      const cost = Number.isFinite(l.costUsd) && l.costUsd > 0 ? l.costUsd : 0;
      await db.query(`insert into credit_line_item ("actionId", kind, provider, label, units, "costUsd", ok, "createdAt") values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        actionId, l.kind, l.provider ?? '', l.label ?? '', JSON.stringify(l.units ?? {}), cost, ok, clock(),
      ]);
      if (ok && cost) await db.query(`update credit_action set "costUsd" = "costUsd" + $2 where id = $1`, [actionId, cost]);
    },

    /* Finish an action. `credits` fixes the charge (a fixed product price, or 0
       to release everything); otherwise it's the recorded real cost, converted
       once. Never more than the hold; settling twice changes nothing. */
    settle: async (s: { actionId: string; userId?: string; credits?: number; outcome: string }) => {
      const owner = s.userId ?? (await db.query<{ userId: string }>(`select "userId" from credit_action where id = $1`, [s.actionId])).rows[0]?.userId;
      if (!owner) throw new CreditError('not_found', 'That action was not found.');
      return inUser(owner, async (q, now) => {
        const a = await action(q, s.actionId, owner);
        if (a.status === 'settled') return { charged: a.charged, already: true, balance: await readBalance(q, owner, now) };
        const charged = await closeAction(q, a, s.credits ?? creditsForCost(a.costUsd), s.outcome, now);
        return { charged, already: false, balance: await readBalance(q, owner, now) };
      });
    },

    /* What an action cost so far (for budget checks while it runs). */
    spent: async (actionId: string) => {
      const { rows } = await db.query<{ costUsd: number; held: number; charged: number; status: 'held' | 'settled' }>(`select "costUsd", held, charged, status from credit_action where id = $1`, [actionId]);
      return rows[0] ? { costUsd: Number(rows[0].costUsd), held: rows[0].held, charged: rows[0].charged, status: rows[0].status } : null;
    },

    /* Background job: settle holds nobody settled in time (a crash, a closed
       tab), then expire lots past their date. */
    sweep: async (limit = 200) => {
      const now = clock();
      const due = await db.query<{ id: string; userId: string; onTimeout: string; held: number }>(
        `select id, "userId", "onTimeout", held from credit_action where status = 'held' and "expiresAt" <= $1 order by "expiresAt" limit $2`,
        [now, limit],
      );
      let settled = 0;
      for (const a of due.rows) {
        await inUser(a.userId, async (q, t) => {
          const row = await action(q, a.id, a.userId);
          if (row.status !== 'held') return;
          await closeAction(q, row, row.onTimeout === 'full' ? row.held : creditsForCost(row.costUsd), 'timeout', t);
          settled++;
        });
      }
      const users = await db.query<{ userId: string }>(
        `select distinct "userId" from credit_lot where "closedAt" is null and "expiresAt" is not null and "expiresAt" <= $1 limit $2`,
        [now, limit],
      );
      for (const u of users.rows) await inUser(u.userId, async () => {});
      return { settled, expiredUsers: users.rowCount ?? 0 };
    },

    history: async (userId: string, limit = 25): Promise<LedgerRow[]> => {
      const { rows } = await db.query<{ id: string; createdAt: Date; delta: number; kind: string; reason: string; meta: Record<string, unknown> }>(
        `select id::text, "createdAt", delta, kind, reason, meta from credit_entry where "userId" = $1 and delta <> 0 order by "createdAt" desc, id desc limit $2`,
        [userId, limit],
      );
      return rows.map((r) => ({ id: r.id, createdAt: new Date(r.createdAt).toISOString(), delta: r.delta, kind: r.kind, reason: r.reason, meta: r.meta }));
    },
  };
}
