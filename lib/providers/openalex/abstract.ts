/* OpenAlex stores abstracts as an inverted index ({ word: [positions] }).
   Put each word back at its positions to rebuild the plain text. */
export function rebuildAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index || typeof index !== 'object') return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) {
      if (Number.isInteger(p) && p >= 0 && p < 100_000) words[p] = word;
    }
  }
  const text = words.filter((w) => w != null).join(' ').replace(/\s+/g, ' ').trim();
  return text || null;
}
