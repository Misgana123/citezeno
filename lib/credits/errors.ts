import type { Balance } from '@/lib/pricing';

/* Every credit failure is a CreditError with a code the routes turn into a
   status and the UI into a message. Messages are written for the user. */

export type CreditErrorCode =
  | 'insufficient_credits' // the hold doesn't fit in what's available
  | 'budget_reached' // the action has used all it may (an assistant reply's budget)
  | 'limit_reached' // a plan limit: paid actions at once, or credits spent today
  | 'not_found'; // no such action for this user

export class CreditError extends Error {
  constructor(
    readonly code: CreditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CreditError';
  }
}

export class InsufficientCredits extends CreditError {
  constructor(
    readonly balance: Balance,
    readonly needed: number,
  ) {
    super('insufficient_credits', `This needs about ${needed} credit${needed === 1 ? '' : 's'} and you have ${balance.total}.`);
  }
}

export class BudgetReached extends CreditError {
  constructor(readonly cap: number) {
    super('budget_reached', `This reply has used its budget of ${cap} credits.`);
  }
}

export const isCreditError = (e: unknown): e is CreditError => (e as Error | null)?.name === 'CreditError' && typeof (e as CreditError).code === 'string';

export const CREDIT_STATUS: Record<CreditErrorCode, number> = {
  insufficient_credits: 402,
  budget_reached: 402,
  limit_reached: 429,
  not_found: 404,
};
