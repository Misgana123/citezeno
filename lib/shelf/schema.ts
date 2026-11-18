/* Shelf tables, run by `npm run db:migrate` (and by the tests, in a throwaway
   schema). Safe to run again: it only adds what is missing.

   Every table holding a user's data carries "userId" with on delete cascade,
   so deleting an account removes the whole shelf. */
export const SHELF_SQL = `
-- Shelf (v8). One record per paper. OpenAlex papers ("ownerId" null) are shared
-- by everyone who saves them; manual and unmatched imported papers belong to one user.
create table if not exists shelf_paper (
  id              text        primary key,
  "ownerId"       text        references "user"(id) on delete cascade,
  "openalexId"    text,
  doi             text,
  title           text        not null,
  year            integer,
  "citedByCount"  integer     not null default 0,
  "isOpenAccess"  boolean     not null default false,
  "isRetracted"   boolean     not null default false,
  origin          text        not null check (origin in ('openalex', 'manual', 'import')),
  data            jsonb       not null,
  "refreshDue"    boolean     not null default false,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now(),
  check (("ownerId" is null) = (origin = 'openalex')),
  check (origin <> 'openalex' or "openalexId" is not null)
);
create unique index if not exists shelf_paper_openalex on shelf_paper ("openalexId") where "ownerId" is null;
create index if not exists shelf_paper_doi on shelf_paper (doi) where doi is not null;
create index if not exists shelf_paper_owner on shelf_paper ("ownerId") where "ownerId" is not null;

-- A paper in one user's shelf.
create table if not exists shelf_item (
  id              text        primary key,
  "userId"        text        not null references "user"(id) on delete cascade,
  "paperId"       text        not null references shelf_paper(id),
  "addedAt"       timestamptz not null default now(),
  "addedVia"      text        not null check ("addedVia" in ('search', 'doi', 'link', 'title', 'upload', 'import', 'manual')),
  "readingStatus" text        not null default 'to_read' check ("readingStatus" in ('to_read', 'reading', 'done')),
  note            text,
  "updatedAt"     timestamptz not null default now(),
  unique ("userId", "paperId")
);
create index if not exists shelf_item_user_added on shelf_item ("userId", "addedAt" desc);
create index if not exists shelf_item_paper on shelf_item ("paperId");

create table if not exists shelf_project (
  id          text        primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  name        text        not null,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists shelf_project_name on shelf_project ("userId", lower(name));

create table if not exists shelf_folder (
  id          text        primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  "projectId" text        not null references shelf_project(id) on delete cascade,
  name        text        not null,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists shelf_folder_name on shelf_folder ("projectId", lower(name));

create table if not exists shelf_tag (
  id          text        primary key,
  "userId"    text        not null references "user"(id) on delete cascade,
  name        text        not null,
  color       text,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists shelf_tag_name on shelf_tag ("userId", lower(name));

create table if not exists shelf_item_project (
  "itemId"    text not null references shelf_item(id) on delete cascade,
  "projectId" text not null references shelf_project(id) on delete cascade,
  primary key ("itemId", "projectId")
);
create index if not exists shelf_item_project_p on shelf_item_project ("projectId");

create table if not exists shelf_item_folder (
  "itemId"   text not null references shelf_item(id) on delete cascade,
  "folderId" text not null references shelf_folder(id) on delete cascade,
  primary key ("itemId", "folderId")
);
create index if not exists shelf_item_folder_f on shelf_item_folder ("folderId");

create table if not exists shelf_item_tag (
  "itemId" text not null references shelf_item(id) on delete cascade,
  "tagId"  text not null references shelf_tag(id) on delete cascade,
  primary key ("itemId", "tagId")
);
create index if not exists shelf_item_tag_t on shelf_item_tag ("tagId");

-- Pairs of papers the user said are not duplicates ("Keep both"). itemA < itemB.
create table if not exists shelf_not_duplicate (
  "userId" text not null references "user"(id) on delete cascade,
  "itemA"  text not null references shelf_item(id) on delete cascade,
  "itemB"  text not null references shelf_item(id) on delete cascade,
  primary key ("userId", "itemA", "itemB"),
  check ("itemA" < "itemB")
);

-- Uploaded PDFs (v9). A PDF waits with no item until the user confirms which
-- paper it is. Several PDFs may belong to one item (a merge keeps them all).
create table if not exists shelf_pdf (
  id            text        primary key,
  "userId"      text        not null references "user"(id) on delete cascade,
  "itemId"      text        references shelf_item(id) on delete cascade,
  "storageKey"  text        not null unique,
  "fileName"    text        not null,
  "sizeBytes"   bigint      not null default 0,
  "pageCount"   integer,
  status        text        not null default 'uploading' check (status in ('uploading', 'ready')),
  "textStatus"  text        not null default 'pending' check ("textStatus" in ('pending', 'done', 'none', 'failed')),
  "text"        text,
  found         jsonb,
  "uploadedAt"  timestamptz not null default now()
);
create index if not exists shelf_pdf_user on shelf_pdf ("userId", "uploadedAt" desc);
create index if not exists shelf_pdf_item on shelf_pdf ("itemId");

-- Files to remove from storage. Every deleted PDF row lands here (also when an
-- item or a whole account is deleted), and a background job empties it.
create table if not exists shelf_storage_trash (
  key         text        primary key,
  "createdAt" timestamptz not null default now(),
  attempts    integer     not null default 0
);
create or replace function shelf_pdf_to_trash() returns trigger language plpgsql as $$
begin
  insert into shelf_storage_trash (key) values (old."storageKey") on conflict do nothing;
  return old;
end $$;
drop trigger if exists shelf_pdf_trash on shelf_pdf;
create trigger shelf_pdf_trash after delete on shelf_pdf for each row execute function shelf_pdf_to_trash();

-- Imports of .bib / .ris files (v10). The entries wait here and are worked
-- through in batches in the background, so large files never time out.
create table if not exists shelf_import (
  id                text        primary key,
  "userId"          text        not null references "user"(id) on delete cascade,
  "fileName"        text        not null,
  format            text        not null,
  "projectId"       text        references shelf_project(id) on delete set null,
  status            text        not null default 'queued' check (status in ('queued', 'done')),
  total             integer     not null default 0,
  "lookupFailures"  integer     not null default 0,
  "lockedUntil"     timestamptz,
  "createdAt"       timestamptz not null default now(),
  "finishedAt"      timestamptz
);
create index if not exists shelf_import_user on shelf_import ("userId", "createdAt" desc);
create index if not exists shelf_import_queued on shelf_import ("createdAt") where status = 'queued';

create table if not exists shelf_import_entry (
  "importId" text    not null references shelf_import(id) on delete cascade,
  idx        integer not null,
  label      text    not null,
  data       jsonb,
  status     text    not null default 'pending' check (status in ('pending', 'matched', 'added', 'duplicate', 'failed')),
  reason     text,
  "itemId"   text,
  primary key ("importId", idx)
);
create index if not exists shelf_import_entry_pending on shelf_import_entry ("importId", idx) where status = 'pending';
`;
