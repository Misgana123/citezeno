import type { DupSummary } from '@/lib/shelf/api/saved-response';
import { toast } from '../toast';

/* After a save: say so, and warn when a similar paper was already on the shelf. */
export function savedToast(done: string, dups: DupSummary[] | undefined) {
  if (!dups?.length) return toast(done);
  const t = dups[0].title.length > 60 ? `${dups[0].title.slice(0, 57)}…` : dups[0].title;
  toast(`${done}. It may already be on your shelf as “${t}”: see Possible duplicates to merge them.`);
}
