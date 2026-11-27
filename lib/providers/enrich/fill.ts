import type { Paper } from '@/lib/papers/types';
import type { PaperPatch, PatchField } from './types';

/* Filling a paper's gaps from a patch, never overwriting what it already has.
   Two facts only ever move one way: a paper found to be open access, or to be
   retracted, stays so. */

const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/* Does the paper lack this field (so a provider that fills it is worth asking)? */
export function missing(p: Paper, field: PatchField): boolean {
  if (field === 'isOpenAccess') return !p.isOpenAccess;
  if (field === 'isRetracted') return !p.isRetracted;
  if (field === 'citedByCount') return !p.citedByCount;
  if (field === 'title') return !p.title || p.title === 'Untitled';
  return empty(p[field]);
}

/* The paper with its gaps filled, and which fields changed. */
export function fillGaps(p: Paper, patch: PaperPatch): { paper: Paper; changed: PatchField[] } {
  const out: Paper = { ...p };
  const changed: PatchField[] = [];
  for (const [field, value] of Object.entries(patch) as [PatchField, unknown][]) {
    if (empty(value) || value === false || value === 0) continue;
    if (!missing(p, field)) continue;
    (out as Record<string, unknown>)[field] = value;
    changed.push(field);
  }
  return { paper: out, changed };
}
