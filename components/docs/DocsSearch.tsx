'use client';

import { useEffect, type ReactNode } from 'react';
import { registerSource } from '@/components/CommandPalette';
import { DOC_CATEGORIES, type DocSearchItem } from '@/lib/docs';

/* Docs search lives in the site's search (Ctrl K, components/CommandPalette): a page puts
   <DocsSearch> in to add its guides and sections as tabs: All, then one per category, All opened first.
   Any <SearchTrigger> opens it too. */

export function SearchTrigger({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => dispatchEvent(new Event('citezeno:palette'))}>
      {children}
    </button>
  );
}

export function DocsSearch({ items }: { items: DocSearchItem[] }) {
  useEffect(() => {
    const results = (list: DocSearchItem[]) =>
      list.map((x) => ({ id: x.href, group: x.kind === 'guide' ? 'Guides' : 'Sections', title: x.title, sub: x.sub, icon: x.kind === 'guide' ? ('doc' as const) : ('link' as const), href: x.href }));
    // All first (every guide), then one tab per category
    const off = [
      registerSource('docs', { tab: 'docs', label: 'All', placeholder: 'Search the docs', results: results(items) }),
      ...DOC_CATEGORIES.map((c) =>
        registerSource(`docs:${c.key}`, { tab: `docs:${c.key}`, label: c.title, placeholder: `Search ${c.title.toLowerCase()}`, results: results(items.filter((x) => x.category === c.key)) }),
      ),
    ];
    return () => off.forEach((f) => f());
  }, [items]);
  return null;
}
