/* Labs as the app shows them, and what can go wrong, in words for the user. */

export type LabRole = 'owner' | 'admin' | 'member' | 'guest';
export const LAB_ROLES = ['owner', 'admin', 'member', 'guest'] as const satisfies readonly LabRole[];

export type Lab = { id: string; name: string; ownerId: string; shelfUserId: string; createdAt: string };

/* Someone's place in a lab. */
export type Membership = { lab: Lab; role: LabRole; creditCap: number | null };

export type LabMember = { userId: string; name: string; email: string; image: string | null; role: LabRole; creditCap: number | null; joinedAt: string; usedThisMonth?: number };

export type LabInvite = { id: string; kind: 'email' | 'link'; email: string | null; role: Exclude<LabRole, 'owner'>; projectId: string | null; access: 'view' | 'edit' | null; createdAt: string; expiresAt: string | null };

/* What Settings → Lab shows. */
export type LabView = {
  lab: { id: string; name: string; createdAt: string } | null;
  role: LabRole | null;
  members: LabMember[];
  /* admins and the owner only */
  invites: LabInvite[];
  link: { on: boolean; url: string | null };
  /* how many people (besides the owner) the owner's plan allows; 0 = not on the Lab plan */
  seats: number;
  /* the user can make a lab (on the Lab plan, in none yet) */
  canCreate: boolean;
  /* labs where the user is a guest on some projects */
  guestOf: { id: string; name: string }[];
};

/* Days an email invitation stays valid. */
export const INVITE_DAYS = 7;
export const LAB_NAME_MAX = 80;

export type LabErrorCode = 'bad_request' | 'not_found' | 'forbidden' | 'conflict' | 'limit' | 'plan_required' | 'expired';

export class LabError extends Error {
  constructor(
    readonly code: LabErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LabError';
  }
}

export const isLabError = (e: unknown): e is LabError => (e as Error | null)?.name === 'LabError' && typeof (e as LabError).code === 'string';

export const LAB_STATUS: Record<LabErrorCode, number> = { bad_request: 400, not_found: 404, forbidden: 403, conflict: 409, limit: 409, plan_required: 402, expired: 410 };

/* Who may do what. */
export const canManage = (role: LabRole | null | undefined) => role === 'owner' || role === 'admin';
