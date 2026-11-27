import { pool } from '@/lib/db';
import { createBilling, type Billing } from './billing';
import { createWallet, type Wallet } from './wallet';

/* The app's wallet and billing, on the app's database. No "server-only" guard:
   the migration script loads this through lib/auth.ts → lib/polar.ts. */

const g = globalThis as unknown as { __czWallet?: Wallet; __czBilling?: Billing };
export const wallet = (): Wallet => (g.__czWallet ??= createWallet(pool));
export const billing = (): Billing => (g.__czBilling ??= createBilling(pool, wallet()));
