import type { BulkBody } from '@/lib/shelf/api/bodies';
import type { ShelfItem } from '@/lib/shelf/types';
import { shelfFetch } from './api';

/* One action on one or more shelf items (see /api/shelf/bulk). */
export const runBulk = (body: BulkBody) => shelfFetch<{ items: ShelfItem[]; deleted: string[] }>('/api/shelf/bulk', { method: 'POST', body });
