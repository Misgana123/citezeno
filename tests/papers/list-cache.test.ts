import { describe, expect, it } from 'vitest';
import { cachedList, forgetList, LIST_TTL_MS, MAX_LISTS, rememberList } from '@/components/papers/listCache';
import { paper } from '../shelf/fixtures';

/* Lists already loaded in the tab: switching Smart → Exact keywords → Smart
   shows Smart's results again without loading them. */

const meta = { total: 2, page: 1, perPage: 25, hasMore: false, mode: 'smart' as const, sort: 'relevance' as const, notices: [] };

describe('loaded lists', () => {
  it('gives back a list loaded earlier, with every page, until it is too old', () => {
    rememberList('/api/papers/search?q=genes', [paper('W1'), paper('W2')], meta, 1000);
    expect(cachedList('/api/papers/search?q=genes', 2000)?.papers.map((p) => p.id)).toEqual(['openalex:W1', 'openalex:W2']);
    expect(cachedList('/api/papers/search?q=genes&mode=keyword', 2000)).toBeNull(); // another mode is another list
    expect(cachedList('/api/papers/search?q=genes', 1000 + LIST_TTL_MS + 1)).toBeNull();
  });

  it('keeps only the most recently used lists, and forgets one on retry', () => {
    for (let i = 0; i < MAX_LISTS + 5; i++) rememberList(`k${i}`, [], meta, 1000);
    expect(cachedList('k0', 1000)).toBeNull();
    expect(cachedList(`k${MAX_LISTS + 4}`, 1000)).not.toBeNull();
    forgetList(`k${MAX_LISTS + 4}`);
    expect(cachedList(`k${MAX_LISTS + 4}`, 1000)).toBeNull();
  });
});
