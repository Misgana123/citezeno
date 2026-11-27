'use client';

import type { Collection } from '@/lib/shelf/types';
import { Icon } from '../Icon';
import { formatCount } from '../papers/format';
import { COLLECTION_LABELS } from './shelf-state';

const ICONS: Record<Collection, 'compass' | 'file'> = { library: 'compass', uploads: 'file' };

/* The two collections at the top of the shelf sidebar. Projects, folders and
   tags below them narrow the collection that is picked here. */
export function CollectionNav({ current, counts, onPick }: { current: Collection | null; counts: Record<Collection, number>; onPick: (c: Collection) => void }) {
  return (
    <ul className="sh-colls" aria-label="Collections">
      {(Object.keys(COLLECTION_LABELS) as Collection[]).map((c) => (
        <li key={c}>
          <button type="button" className="sh-coll" aria-current={current === c ? 'true' : undefined} onClick={() => onPick(c)}>
            <span className="sh-coll-ico">
              <Icon name={ICONS[c]} />
            </span>
            <b>{COLLECTION_LABELS[c].name}</b>
            <small>{COLLECTION_LABELS[c].hint}</small>
            <span className="sh-coll-n">{formatCount(counts[c])}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
