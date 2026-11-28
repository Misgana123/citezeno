import { membershipOf } from '@/lib/labs/store';
import { canManage } from '@/lib/labs/types';
import type { Queryable } from '@/lib/shelf/db';
import type { SkillLab } from './store';

/* The lab whose shared skills a user sees (owner, admins and members; guests don't). */
export async function skillLabOf(q: Queryable, userId: string): Promise<SkillLab | null> {
  const m = await membershipOf(q, userId);
  return m ? { id: m.lab.id, shelfUserId: m.lab.shelfUserId, manage: canManage(m.role) } : null;
}
