import type { IconName } from '../Icon';
import { formatCount } from './format';

/* The three related-paper lists a preview offers. */
export type RelatedKind = 'references' | 'cited-by' | 'similar';

export const RELATED: Record<RelatedKind, { label: string; icon: IconName; empty: string; count: (n: number) => string }> = {
  references: {
    label: 'Papers it cites',
    icon: 'quote',
    empty: 'OpenAlex has no references listed for this paper, or none match your filters.',
    count: (n) => `${formatCount(n)} reference${n === 1 ? '' : 's'}`,
  },
  'cited-by': {
    label: 'Papers that cite it',
    icon: 'thread',
    empty: 'No papers cite this one yet, or none match your filters.',
    count: (n) => `Cited by ${formatCount(n)} paper${n === 1 ? '' : 's'}`,
  },
  similar: {
    label: 'More like this',
    icon: 'sparkle',
    empty: 'No similar papers found with your filters.',
    count: (n) => `${formatCount(n)} similar paper${n === 1 ? '' : 's'}`,
  },
};

export const RELATED_KINDS = Object.keys(RELATED) as RelatedKind[];
