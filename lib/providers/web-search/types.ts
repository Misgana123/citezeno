/* The web search job: search the open web (news, docs, reports, sites) for
   the assistant, when the user has web search on. Academic papers come from
   the paper data job instead. */

export type WebResult = {
  title: string;
  url: string;
  /* the part of the page that matched, as the search service gives it */
  snippet: string;
  /* when the page was published, when the service knows (YYYY-MM-DD) */
  published: string | null;
};

export type WebSearchOptions = {
  maxResults: number;
  /* "news" favors recent news articles */
  topic?: 'general' | 'news';
  /* only pages from the last n days */
  days?: number;
};

export interface WebSearch {
  readonly name: string;
  search(query: string, opts: WebSearchOptions): Promise<WebResult[]>;
}
