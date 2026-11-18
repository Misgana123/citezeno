import type { SearchMode } from '@/lib/papers/search/options';
import type { SearchNotice } from '@/lib/papers/search/types';
import { formatCount } from './format';

/* What each search notice says to the user. */
export function noticeText(n: SearchNotice, ctx: { mode: SearchMode; total: number; maxQueryChars: number }): string {
  switch (n) {
    case 'query_truncated':
      return `Only the first ${formatCount(ctx.maxQueryChars)} characters of your text were used.`;
    case 'filtered_top_results':
      return `The minimum citation count was applied to the top matches only, so some papers may be missing. Use Exact keywords to filter every match.`;
    case 'results_capped':
      return ctx.mode === 'semantic'
        ? 'Search by meaning returns the 50 closest papers.'
        : `Smart mode shows the best ${formatCount(ctx.total)} matches. Use Exact keywords to browse every match.`;
  }
}
