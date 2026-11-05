import type { SVGProps } from 'react';

/* A small hand-drawn icon set (24px grid, 1.8 stroke) so the app has no icon dependency. */
const PATHS: Record<string, string> = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'm5 12.5 4.2 4.2L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  swap: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  cards: 'M4 5h16v6H4zM4 15h16v4H4z',
  map: 'M5 6a2 2 0 1 0 0 .01M5 18a2 2 0 1 0 0 .01M19 12a2 2 0 1 0 0 .01M7 6c6 0 6 6 10 6M7 18c6 0 6-6 10-6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  code: 'm8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  book: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  wand: 'm4 20 11-11M14 4v3M19 9h-3M18 5l-2 2',
  alert: 'M12 8v5M12 16.5h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  eraser: 'M8 20h12M5 15l8.5-8.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8z',
  stop: 'M7 7h10v10H7z',
  thread: 'M4 18c4 0 4-12 8-12s4 12 8 12',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 20h14',
  word: 'M6 3h9l5 5v13H6zM15 3v5h5M8.5 11l1.5 6 2-4.5 2 4.5 1.5-6',
  pdf: 'M6 3h9l5 5v13H6zM15 3v5h5M9 17v-5h1.5a1.5 1.5 0 0 1 0 3H9M14 12v5M14 12h2.5M14 14.5h2',
  chevron: 'm9 6 6 6-6 6',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  device: 'M3 5h18v11H3zM8 20h8M12 16v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function LogoMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#133a63" />
      <path d="M21.5 10.2A8 8 0 1 0 21.5 21.8" fill="none" stroke="#e9f1f6" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M21.5 21.8c1.6-1.4 2.4-3.4 2.6-5.6" fill="none" stroke="#e2a01b" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.8 2.2" />
      <circle cx="24.2" cy="13.6" r="2.4" fill="#e2a01b" />
    </svg>
  );
}
