import { ogCard, ogSize } from '@/lib/og/card';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Citezeno: research with sources that exist';

export default function Image() {
  return ogCard({ kicker: 'AI research platform · real sources', title: 'Research with sources that exist.' });
}
