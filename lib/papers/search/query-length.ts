/* Search text length. Each paper provider says how much text it accepts
   (PaperSource.limits.maxQueryChars); this is the fallback when none is given. */

export const DEFAULT_QUERY_CHARS = 1500;

/* Cut text to `max` characters, at a word break when one is near the end. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space >= max * 0.8 ? cut.slice(0, space) : cut).trim();
}
