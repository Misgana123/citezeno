/* Reader tables, run by `npm run db:migrate` (and by the tests, in a throwaway
   schema). Safe to run again; only adds what is missing.

   Sharing: text, passages and summaries made from a reusable-license
   open-access PDF are "shared" (made once, used by everyone). Anything made
   from a user's own upload is that user's, and is deleted with the upload.
   Highlights, page notes and reading positions are always private and are
   deleted with the account. Nothing here is used to train AI. */

export const READER_SQL = `
-- A paper's text, made once per PDF: the shared open-access copy of a paper,
-- or one user's upload.
create table if not exists reader_text (
  id               text        primary key,
  "paperId"        text        not null,
  scope            text        not null check (scope in ('shared', 'user')),
  "ownerId"        text        references "user"(id) on delete cascade,
  -- the user's upload this text came from (scope "user")
  "pdfId"          text        references shelf_pdf(id) on delete cascade,
  -- where the open-access PDF came from, and the stored shared copy (only for reusable licenses)
  "sourceUrl"      text,
  "storageKey"     text,
  license          text,
  status           text        not null default 'pending' check (status in ('pending', 'processing', 'ready', 'no_text', 'failed')),
  -- extracted → split into passages; embedded → vectors made (search by meaning works)
  stage            text        not null default 'extract' check (stage in ('extract', 'embed', 'done')),
  "pageCount"      integer,
  "tokenCount"     integer,
  "embeddingModel" text,
  "embeddingDims"  integer,
  error            text,
  attempts         integer     not null default 0,
  "lockedUntil"    timestamptz,
  "processedAt"    timestamptz,
  "lastOpenedAt"   timestamptz not null default now(),
  "createdAt"      timestamptz not null default now(),
  check ((scope = 'shared') = ("ownerId" is null)),
  check ((scope = 'user') = ("pdfId" is not null))
);
-- the paper's title, for passage embeddings (context) and the job's logs
alter table reader_text add column if not exists title text;
create unique index if not exists reader_text_shared on reader_text ("paperId") where scope = 'shared';
create unique index if not exists reader_text_pdf on reader_text ("pdfId") where "pdfId" is not null;
create index if not exists reader_text_work on reader_text (stage, "createdAt") where stage <> 'done' and status <> 'failed';

-- About a paragraph of a paper's text, with where it sits: what answers and
-- summaries cite ("p12-3" = page 12, passage 3).
create table if not exists reader_passage (
  "textId"       text        not null references reader_text(id) on delete cascade,
  id             text        not null,
  ord            integer     not null,
  page           integer     not null,
  section        text,
  "isReferences" boolean     not null default false,
  text           text        not null,
  tokens         integer     not null default 0,
  -- fractions of the page (0–1) from the top-left: the passage's first and last lines
  box            jsonb       not null,
  tsv            tsvector    generated always as (to_tsvector('english', coalesce(section, '') || ' ' || text)) stored,
  primary key ("textId", id)
);
create index if not exists reader_passage_order on reader_passage ("textId", ord);
create index if not exists reader_passage_tsv on reader_passage using gin (tsv);

-- A highlight (and its note) in one user's copy of a paper.
create table if not exists reader_highlight (
  id          text        primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  "paperId"   text        not null,
  page        integer     not null,
  quote       text        not null,
  prefix      text        not null default '',
  suffix      text        not null default '',
  rects       jsonb       not null,
  color       text        not null,
  note        text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists reader_highlight_paper on reader_highlight ("userId", "paperId", page);
-- which copy of the PDF the highlight was made on ("upload:<id>" or "open_access"): on another copy it is found again by its text
alter table reader_highlight add column if not exists "pdfKey" text;

-- A sticky note placed on a page.
create table if not exists reader_page_note (
  id          text        primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  "paperId"   text        not null,
  page        integer     not null,
  x           double precision not null,
  y           double precision not null,
  text        text        not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists reader_page_note_paper on reader_page_note ("userId", "paperId", page);

-- A paper's summary: from its text (shared or one user's), or from the abstract only.
create table if not exists reader_summary (
  id          text        primary key,
  "paperId"   text        not null,
  "textId"    text        references reader_text(id) on delete cascade,
  "basedOn"   text        not null check ("basedOn" in ('full_text', 'abstract')),
  content     jsonb       not null,
  model       text        not null,
  "createdAt" timestamptz not null default now(),
  check (("basedOn" = 'full_text') = ("textId" is not null))
);
create unique index if not exists reader_summary_text on reader_summary ("textId") where "textId" is not null;
create unique index if not exists reader_summary_abstract on reader_summary ("paperId") where "basedOn" = 'abstract';

-- Where each user stopped reading each paper (and when, for "Continue reading").
create table if not exists reader_position (
  "userId"    text        not null references "user"(id) on delete cascade,
  "paperId"   text        not null,
  page        integer     not null default 1,
  "pageCount" integer,
  title       text        not null default '',
  "updatedAt" timestamptz not null default now(),
  primary key ("userId", "paperId")
);
create index if not exists reader_position_recent on reader_position ("userId", "updatedAt" desc);

-- Every AI call the reader makes: who, which paper, what for, and what it cost.
create table if not exists reader_ai_log (
  id             bigserial   primary key,
  "userId"       text,
  "paperId"      text        not null,
  action         text        not null,
  model          text        not null,
  "inputTokens"  integer     not null default 0,
  "outputTokens" integer     not null default 0,
  "costUsd"      double precision not null default 0,
  "createdAt"    timestamptz not null default now()
);
create index if not exists reader_ai_log_day on reader_ai_log ("createdAt");

-- A paper's own conversation is a normal assistant chat with the paper attached.
alter table agent_conversation add column if not exists "paperId" text;
create index if not exists agent_conversation_paper on agent_conversation ("userId", "paperId") where "paperId" is not null;
`;
