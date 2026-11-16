/* The designs a shared trace can be published in. Used by the browser (the
   picker and its preview) and by the server (validation and the public page). */
import type { Mode } from './types';

export type ShareTheme = 'dossier' | 'reading' | 'cyanotype' | 'monograph' | 'threads';

export type ThemeMeta = {
  id: ShareTheme;
  name: string;
  blurb: string;
  /* the design has a dark top, so the site nav sits over it transparently */
  dark: boolean;
};

export const SHARE_THEMES: ThemeMeta[] = [
  { id: 'dossier', name: 'Dossier', blurb: 'Trust first: a blue header with the numbers, printed pages and a verification panel.', dark: false },
  { id: 'reading', name: 'Reading Room', blurb: 'Calm and editorial: a serif title, the text on paper and a rail of sources beside it.', dark: false },
  { id: 'cyanotype', name: 'Cyanotype', blurb: 'A full-bleed blue hero with the sheet rising out of it and a strip of source cards.', dark: true },
  { id: 'monograph', name: 'Monograph', blurb: 'Minimal and scholarly: hairlines, a contents column and the notes in the margin.', dark: false },
  { id: 'threads', name: 'Claim Threads', blurb: 'Dark studio: a thread runs from each cited sentence to the record that supports it.', dark: true },
];

export const DEFAULT_THEME: ShareTheme = 'dossier';

export const isShareTheme = (x: unknown): x is ShareTheme => typeof x === 'string' && SHARE_THEMES.some((t) => t.id === x);

export const themeMeta = (id: ShareTheme): ThemeMeta => SHARE_THEMES.find((t) => t.id === id) || SHARE_THEMES[0];

export const MODE_LABEL: Record<Mode, string> = {
  intext: 'In-text citations',
  footnotes: 'Footnotes',
  endnotes: 'Endnotes',
  list: 'Bibliography only',
  annotated: 'Annotated bibliography',
};

export const SHARE_MODES = Object.keys(MODE_LABEL) as Mode[];

export const isShareMode = (x: unknown): x is Mode => typeof x === 'string' && SHARE_MODES.includes(x as Mode);
