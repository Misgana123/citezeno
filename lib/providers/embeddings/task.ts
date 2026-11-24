import type { EmbedInput, EmbedKind } from './types';

/* For models that read the job from the text itself (gemini-embedding-2, by
   any route): a question is marked as a search, a passage with its title. */
export function taskText(kind: EmbedKind, input: EmbedInput): string {
  const title = input.title?.trim() || null;
  return kind === 'query' ? `task: search result | query: ${input.text}` : `title: ${title ?? 'none'} | text: ${input.text}`;
}
