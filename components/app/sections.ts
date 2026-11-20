import type { IconName } from '../Icon';

/* The app's sections, in the order the rail shows them on every page (the
   citation studio included). */
export type AppSection = 'chat' | 'citation' | 'papers' | 'shelf' | 'library' | 'history' | 'account' | 'admin' | null;

export const APP_SECTIONS: { id: Exclude<AppSection, null | 'account' | 'admin'>; href: string; icon: IconName; label: string; short: string }[] = [
  { id: 'chat', href: '/app/chat', icon: 'sparkle', label: 'Assistant', short: 'Chat' },
  { id: 'citation', href: '/app/citation', icon: 'doc', label: 'Citation studio', short: 'Cite' },
  { id: 'papers', href: '/app/papers', icon: 'book', label: 'Find papers', short: 'Papers' },
  { id: 'shelf', href: '/app/shelf', icon: 'layers', label: 'My shelf', short: 'Shelf' },
  { id: 'library', href: '/app/library', icon: 'history', label: 'Library', short: 'Library' },
  { id: 'history', href: '/app/history', icon: 'clock', label: 'History', short: 'History' },
];
