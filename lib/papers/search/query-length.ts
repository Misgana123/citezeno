/* How much search text OpenAlex accepts. Free and keyless accounts may send
   1,500 characters per search (keyword or semantic); paid plans up to 2,000,
   which is also all that semantic search reads. Set by OPENALEX_MAX_QUERY_CHARS. */

export const QUERY_CHARS_LIMIT = 2000;
export const DEFAULT_QUERY_CHARS = 1500;

/* Cut text to `max` characters, at a word break when one is near the end. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space >= max * 0.8 ? cut.slice(0, space) : cut).trim();
}
