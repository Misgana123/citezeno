'use client';

/* Opening the Settings dialog from anywhere: a button calls openSettings(),
   a link uses settingsHref() (the dialog opens over the page it lands on). */

export const SETTINGS_SECTIONS = ['account', 'usage', 'lab', 'appearance', 'library', 'security', 'customize'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/* Customize (skills): which view to show */
export type CustomizeView = 'yours' | 'discover';
export type SettingsTarget = { section: SettingsSection; view?: CustomizeView };

export const SETTINGS_EVENT = 'citezeno:settings';

export const openSettings = (section: SettingsSection = 'account', opts: { view?: CustomizeView } = {}) =>
  window.dispatchEvent(new CustomEvent<SettingsTarget>(SETTINGS_EVENT, { detail: { section, ...opts } }));

/* A link that opens Settings (on the assistant's page unless another page is given). */
export function settingsHref(section: SettingsSection = 'account', opts: { view?: CustomizeView; path?: string } = {}): string {
  const q = new URLSearchParams({ settings: section });
  if (opts.view) q.set('view', opts.view);
  return `${opts.path ?? '/app/chat'}?${q}`;
}

/* The target a link asked for (?settings=…&view=…), or null. */
export function targetFromParams(p: URLSearchParams): SettingsTarget | null {
  const s = p.get('settings');
  if (s == null) return null;
  const section = (SETTINGS_SECTIONS as readonly string[]).includes(s) ? (s as SettingsSection) : 'account';
  const view = p.get('view');
  return { section, ...(view === 'yours' || view === 'discover' ? { view } : {}) };
}
