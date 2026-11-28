'use client';

import type { Skill, SkillCatalog } from '@/lib/skills/types';
import { ConnectorApiError, connectorFetch } from '../connectors/api';

/* Browser-side calls to /api/skills (same JSON error shape as the connectors'). */

export const skillFetch = connectorFetch;
export { ConnectorApiError as SkillApiError };

export const loadSkills = () => skillFetch<SkillCatalog>('/api/skills');
export const addBuiltinSkill = (slug: string) => skillFetch<{ skill: Skill }>('/api/skills', { method: 'POST', body: { builtin: slug } }).then((r) => r.skill);
export const createSkill = (s: { name: string; description?: string; instructions: string }) => skillFetch<{ skill: Skill }>('/api/skills', { method: 'POST', body: s }).then((r) => r.skill);
export const uploadSkill = (markdown: string, fileName: string) => skillFetch<{ skill: Skill }>('/api/skills', { method: 'POST', body: { markdown, fileName } }).then((r) => r.skill);
export const updateSkill = (id: string, patch: { enabled?: boolean; name?: string; description?: string; instructions?: string }) =>
  skillFetch<{ skill: Skill }>(`/api/skills/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }).then((r) => r.skill);
export const removeSkill = (id: string) => skillFetch<{ removed: boolean }>(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
