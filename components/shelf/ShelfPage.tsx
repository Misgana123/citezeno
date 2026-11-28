'use client';

import { Shelf } from './Shelf';
import { SpaceSwitch, useShelfSpace } from './ShelfSpaces';

/* The shelf page: your shelf, or your lab's (a fresh shelf for each, so nothing mixes). */
export function ShelfPage({ initialQuery, focusItem }: { initialQuery: string; focusItem: string | null }) {
  const { space, options, setSpace } = useShelfSpace();
  return <Shelf key={space ?? 'personal'} initialQuery={space ? '' : initialQuery} focusItem={space ? null : focusItem} top={<SpaceSwitch space={space} options={options} onChange={setSpace} />} />;
}
