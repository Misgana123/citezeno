/* Our own copy of papers, run by `npm run db:migrate`. Safe to run again: it
   only adds what is missing.

   One row per paper: keyed by its DOI when it has one (so the same paper from
   two providers is one row), else by its Citezeno ID. `data` is the Paper as
   its provider gave it; every column used to search and filter is computed
   from it, so the two can never disagree. No users and no search text.

   The words index is built on SEARCH_DOC itself rather than a stored column, so
   each paper's words are kept once (in the index), not twice: about 1 KB a
   paper less. Queries must use the same SEARCH_DOC to use the index. */
export const SEARCH_DOC = `(setweight(to_tsvector('english', coalesce(data->>'title', '')), 'A') || setweight(to_tsvector('english', left(coalesce(data->>'abstract', ''), 2000)), 'B'))`;

export const PAPERS_LOCAL_SQL = `
create table if not exists paper_record (
  key            text        primary key,  -- "doi:10.x/y", or the Citezeno ID when there is no DOI
  ids            text[]      not null,     -- every Citezeno ID it is known by ("openalex:W1", "arxiv:2101.00001")
  data           jsonb       not null,     -- the Paper, from the provider that owns this row
  detail         boolean     not null default false, -- full details (topics, references), not just a result card
  origin         text        not null,     -- how it first came in: 'live' (a user saw it) or 'seed:<source>'
  "fetchedAt"    timestamptz not null default now(), -- when the owner last sent it
  "seenAt"       timestamptz not null default now(), -- when a user last saw it (oldest go first when full)
  hits           integer     not null default 1,
  provider       text        generated always as (data->>'provider') stored,
  doi            text        generated always as (data->>'doi') stored,
  title          text        generated always as (data->>'title') stored,
  year           integer     generated always as ((data->>'year')::integer) stored,
  "citedByCount" integer     generated always as (coalesce((data->>'citedByCount')::integer, 0)) stored,
  type           text        generated always as (data->>'type') stored,
  language       text        generated always as (data->>'language') stored,
  "isOpenAccess" boolean     generated always as (coalesce((data->>'isOpenAccess')::boolean, false)) stored,
  "isRetracted"  boolean     generated always as (coalesce((data->>'isRetracted')::boolean, false)) stored,
  "hasAbstract"  boolean     generated always as (coalesce(data->>'abstract', '') <> '') stored
);
create index if not exists paper_record_ids on paper_record using gin (ids);
-- v12: the words index on the expression (an earlier stored "search" column is dropped)
alter table paper_record drop column if exists search;
create index if not exists paper_record_words on paper_record using gin (${SEARCH_DOC});
create index if not exists paper_record_seen on paper_record ("seenAt");
create index if not exists paper_record_cited on paper_record ("citedByCount" desc);
-- v11: when the fill-in services were last asked about it (null: never)
alter table paper_record add column if not exists "filledAt" timestamptz;
create index if not exists paper_record_fetched on paper_record ("fetchedAt");

-- How far the background download has got with each source: its cursor, how
-- many papers it has brought in, and when it last ran. One row per source.
create table if not exists paper_sync (
  source       text        primary key,
  cursor       text,
  fetched      integer     not null default 0,
  "doneAt"     timestamptz,          -- when it reached its target (then it only tops up)
  "ranAt"      timestamptz,
  "lastError"  text
);
`;
