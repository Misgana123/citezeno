import { ogCard, ogSize } from '@/lib/og/card';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Citezeno: every claim needs a source that exists';

export default function Image() {
  return ogCard({ kicker: '12 citation styles · real sources', title: 'Every claim needs a source that exists.' });
}
