/* The `select=` lists sent to OpenAlex, so responses carry only what we map. */

/* Enough for a result card. */
export const CARD_FIELDS = [
  'id',
  'doi',
  'display_name',
  'publication_year',
  'publication_date',
  'type',
  'language',
  'cited_by_count',
  'is_retracted',
  'abstract_inverted_index',
  'authorships',
  'primary_location',
  'best_oa_location',
  'open_access',
  'primary_topic',
] as const;

/* Everything the preview panel needs, including the reference list. */
export const DETAIL_FIELDS = [...CARD_FIELDS, 'topics', 'keywords', 'referenced_works'] as const;

export const selectParam = (fields: readonly string[]) => fields.join(',');
