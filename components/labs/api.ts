'use client';

import type { LabInvite, LabRole, LabView } from '@/lib/labs/types';
import { apiFetch } from '../api-fetch';

/* Browser-side calls to /api/labs. */

export const loadLab = () => apiFetch<LabView>('/api/labs');
export const createLab = (name: string) => apiFetch<LabView>('/api/labs', { method: 'POST', body: { name } });
export const renameLab = (name: string) => apiFetch<LabView>('/api/labs', { method: 'PATCH', body: { name } });
export const deleteLab = () => apiFetch<{ deleted: boolean }>('/api/labs', { method: 'DELETE' });
export const inviteToLab = (i: { email: string; role: 'admin' | 'member' | 'guest'; projectId?: string | null; access?: 'view' | 'edit' | null }) => apiFetch<{ invite: LabInvite }>('/api/labs/invites', { method: 'POST', body: i });
export const cancelInvite = (id: string) => apiFetch<{ cancelled: boolean }>(`/api/labs/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const setShareLink = (on: boolean) => apiFetch<{ url: string | null }>('/api/labs/link', { method: 'POST', body: { on } });
export const inviteInfo = (token: string) => apiFetch<{ lab: string; role: LabRole; inviter: string | null; email: string | null }>(`/api/labs/join?token=${encodeURIComponent(token)}`);
export const joinLab = (token: string) => apiFetch<{ lab: { id: string; name: string } }>('/api/labs/join', { method: 'POST', body: { token } });
export const updateMember = (userId: string, p: { role?: 'admin' | 'member'; creditCap?: number | null }) => apiFetch(`/api/labs/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: p });
export const removeMember = (userId: string, labId?: string) => apiFetch(`/api/labs/members/${encodeURIComponent(userId)}${labId ? `?lab=${encodeURIComponent(labId)}` : ''}`, { method: 'DELETE' });
export const transferLab = (userId: string) => apiFetch('/api/labs/transfer', { method: 'POST', body: { userId } });
export const projectGuests = (projectId: string) => apiFetch<{ people: { userId: string; name: string; email: string; access: 'view' | 'edit' }[] }>(`/api/labs/projects/${encodeURIComponent(projectId)}/access`);
export const setProjectAccess = (projectId: string, userId: string, access: 'view' | 'edit' | null) => apiFetch(`/api/labs/projects/${encodeURIComponent(projectId)}/access`, { method: 'POST', body: { userId, access } });
