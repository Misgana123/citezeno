'use client';

import type { ShelfItem } from '@/lib/shelf/types';
import { Icon } from '../../Icon';
import { UploadTile } from './UploadTile';

/* My uploads as a gallery of first pages, opening with a tile to add more. */
export function UploadsGallery({
  items,
  openId,
  selected,
  freshId,
  onSelect,
  onOpen,
  onAdd,
}: {
  items: ShelfItem[];
  openId: string | null;
  selected: Set<string>;
  freshId: string | null;
  onSelect: (item: ShelfItem, on: boolean, shift: boolean) => void;
  onOpen: (item: ShelfItem) => void;
  onAdd: () => void;
}) {
  return (
    <ol className="sh-gallery">
      <li>
        <button type="button" className="sh-add-tile" onClick={onAdd}>
          <span className="sh-add-ring">
            <Icon name="upload" />
          </span>
          <b>Add a PDF</b>
          <span>Drop files here or anywhere on this page</span>
        </button>
      </li>
      {items.map((item) => (
        <UploadTile key={item.id} item={item} active={openId === item.id} selected={selected.has(item.id)} fresh={freshId === item.id} onSelect={onSelect} onOpen={onOpen} />
      ))}
    </ol>
  );
}
