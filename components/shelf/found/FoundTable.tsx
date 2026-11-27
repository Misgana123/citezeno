'use client';

import type { ShelfItem } from '@/lib/shelf/types';
import { FoundRow, type RowProps } from './FoundRow';

/* The Library as a reference table: Title · Year · Published in · Access. */
export function FoundTable({ items, openId, selected, freshId, ...rest }: Omit<RowProps, 'item' | 'active' | 'selected' | 'fresh'> & { items: ShelfItem[]; openId: string | null; selected: Set<string>; freshId: string | null }) {
  return (
    <div className="sh-table">
      <div className="sh-tr sh-th" aria-hidden="true">
        <span>Title</span>
        <span>Year</span>
        <span>Published in</span>
        <span>Access</span>
        <span />
      </div>
      <ol className="sh-tbody">
        {items.map((item) => (
          <FoundRow key={item.id} item={item} active={openId === item.id} selected={selected.has(item.id)} fresh={freshId === item.id} {...rest} />
        ))}
      </ol>
    </div>
  );
}
