/* The parts of OpenAlex's responses that Find Papers reads.
   Every field is optional: OpenAlex records are often incomplete. */

export type OpenAlexSource = { display_name?: string | null } | null;

export type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  raw_source_name?: string | null;
  source?: OpenAlexSource;
} | null;

export type OpenAlexWork = {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string | null;
  language?: string | null;
  cited_by_count?: number | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string | null; orcid?: string | null } | null; raw_author_name?: string | null }[] | null;
  primary_location?: OpenAlexLocation;
  best_oa_location?: OpenAlexLocation;
  open_access?: { is_oa?: boolean | null; oa_url?: string | null } | null;
  topics?: { display_name?: string | null }[] | null;
  keywords?: { display_name?: string | null }[] | null;
  referenced_works?: string[] | null;
  relevance_score?: number | null;
};

export type OpenAlexMeta = {
  count?: number | null;
  page?: number | null;
  per_page?: number | null;
  cost_usd?: number | null;
};

export type OpenAlexList = { meta?: OpenAlexMeta; results?: OpenAlexWork[] };
