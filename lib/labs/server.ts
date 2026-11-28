import 'server-only';
import { billing } from '@/lib/credits/server';
import { pool } from '@/lib/db';
import { labInviteEmail, sendEmail } from '@/lib/email';
import { NO_PLAN } from '@/lib/plans';
import { siteURL } from '@/lib/site';
import type { LabDeps } from './service';

/* The labs service wired to the app: the database, plans and email. */
export const labDeps = (): LabDeps => ({
  db: pool,
  limitsOf: async (userId) => (await billing().currentPlan(userId))?.limits ?? NO_PLAN,
  sendInvite: (to, m) => sendEmail({ to, ...labInviteEmail(m) }),
  siteURL,
});
