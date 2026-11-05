import { ogCard, ogSize } from '@/lib/og/card';
import { STYLE_GUIDES } from '@/lib/style-guides';
import { SPECIMENS, plain, specimen } from '@/lib/styles';

export const size = ogSize;
export const contentType = 'image/png';
export const alt = 'Citation style example from Citezeno';

export function generateStaticParams() {
  return Object.keys(STYLE_GUIDES).map((id) => ({ id }));
}

/* A share card per style, showing a real example reference in that style. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = STYLE_GUIDES[id];
  const sample = plain(specimen(id, SPECIMENS.article).entry);
  return ogCard({ kicker: 'Free citation generator', title: `${g ? g.label : 'Citation'} citations, from real sources`, sample });
}
