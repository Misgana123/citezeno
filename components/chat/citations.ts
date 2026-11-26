'use client';

import type { CitedSource } from '@/lib/agent/tools/client';
import { traceClaim } from '@/lib/engine';
import { plain, STYLES } from '@/lib/styles';
import { analyse, topicTokens } from '@/lib/text';
import { DEFAULT_PREFS, type ApiSettings, type Name, type Prefs, type Source } from '@/lib/types';
import { holdCredits, OutOfCredits, settleCredits } from '../useCredits';

/* The assistant's find_citations step, run here in the browser with the
   Studio's own citation search (unchanged): the user's Studio settings (which
   databases, years, how strict, their API settings), 1 credit per search as
   "Cite selection" charges, released when nothing is found. */

export type ClientRun = { ok: true; sources: CitedSource[]; note?: string } | { ok: false; error: string };

function stored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`cz:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* The Studio's saved settings, merged with the defaults the same way the Studio does. */
export function studioPrefs(): Prefs {
  const p = stored<Partial<Prefs>>('prefs');
  return {
    ...DEFAULT_PREFS,
    ...(p ?? {}),
    providers: { ...DEFAULT_PREFS.providers, ...(p?.providers ?? {}) },
    style: p?.style && STYLES[p.style] ? p.style : DEFAULT_PREFS.style,
    minRel: typeof p?.minRel === 'number' && p.minRel !== 0.15 ? p.minRel : DEFAULT_PREFS.minRel,
  };
}

const person = (n: Name) => (n.literal ? n.family : [n.given, n.family].filter(Boolean).join(' '));

function authors(list: Name[]): string {
  const names = list.map(person).filter(Boolean);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.join(', ');
}

export function toCited(s: Source, style: string): CitedSource {
  const st = STYLES[style] ?? STYLES[DEFAULT_PREFS.style];
  let reference = s.title;
  try {
    reference = plain(st.entry(s)).replace(/\s+/g, ' ').trim();
  } catch {
    // an odd record: the title is better than nothing
  }
  return {
    title: s.title.slice(0, 1000),
    authors: authors(s.authors ?? []).slice(0, 500),
    year: s.year ?? null,
    venue: (s.container || s.publisher || s.site || null)?.slice(0, 500) ?? null,
    link: s.doi ? `https://doi.org/${s.doi}` : (s.url ?? null),
    reference: reference.slice(0, 3000),
    ...(s.retracted ? { retracted: true } : {}),
  };
}

export async function runFindCitations(input: { text?: unknown; count?: unknown; style?: unknown }): Promise<ClientRun> {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text.length < 3) return { ok: false, error: 'There was no text to find sources for.' };
  const prefs = studioPrefs();
  const settings = stored<ApiSettings>('settings') ?? {};
  const n = Math.min(5, Math.max(1, Math.floor(Number(input.count) || 3)));
  const style = typeof input.style === 'string' && STYLES[input.style.toLowerCase()] ? input.style.toLowerCase() : prefs.style;

  let actionId: string | null = null;
  let kept = false;
  try {
    actionId = await holdCredits(1, 'cite');
    const found = await traceClaim(text, prefs, settings, n, new Set(), topicTokens(analyse(text)));
    const sources = found.ids.map((id) => found.db.get(id)).filter((s): s is Source => !!s).map((s) => toCited(s, style));
    if (!sources.length) return { ok: true, sources: [], note: 'No matching source was found (no credit was charged). A longer or more specific claim may work better.' };
    kept = true;
    return { ok: true, sources };
  } catch (e) {
    if (e instanceof OutOfCredits) return { ok: false, error: `The user is out of credits: finding sources needs 1 credit and they have ${e.have}.` };
    return { ok: false, error: (e as Error).message || 'The citation search failed.' };
  } finally {
    if (actionId) settleCredits(actionId, kept ? 1 : 0);
  }
}

/* Every tool the chat page can run in the browser. */
export async function runClientTool(name: string, input: unknown): Promise<ClientRun> {
  if (name === 'find_citations') return runFindCitations((input ?? {}) as Record<string, unknown>);
  return { ok: false, error: `This page can’t run "${name}".` };
}
