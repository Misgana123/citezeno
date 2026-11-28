/* Labs (lib/labs), run by `npm run db:migrate` (and by the tests, in a
   throwaway schema). Safe to run again.

   A lab is a research group on the Lab plan. Its shared shelf belongs to a
   hidden account of its own ("shelfUserId": a user row nobody can sign in
   with), so the shelf code works on it unchanged and a member never reaches
   anyone's personal papers. Deleting the lab deletes that account, and with it
   the lab's shelf. The owner's plan pays for the lab's work. */
export const LABS_SQL = `
create table if not exists lab (
  id             text        primary key,
  name           text        not null,
  "ownerId"      text        not null references "user"(id) on delete cascade,
  "shelfUserId"  text        not null unique references "user"(id) on delete cascade,
  "createdAt"    timestamptz not null default now()
);
create unique index if not exists lab_owner on lab ("ownerId");
-- a lab that goes (its owner deleted their account) takes its shelf account with it
create or replace function lab_delete_shelf() returns trigger language plpgsql as $$
begin
  delete from "user" where id = old."shelfUserId";
  return old;
end $$;
drop trigger if exists lab_delete_shelf on lab;
create trigger lab_delete_shelf after delete on lab for each row execute function lab_delete_shelf();

-- Everyone in a lab. Owner, admin and member see the whole lab; a guest sees
-- only the projects shared with them (project_access). creditCap: the most
-- lab credits a member may spend in a calendar month (null = no cap).
create table if not exists lab_member (
  "labId"     text        not null references lab(id) on delete cascade,
  "userId"    text        not null references "user"(id) on delete cascade,
  role        text        not null check (role in ('owner', 'admin', 'member', 'guest')),
  "creditCap" integer     check ("creditCap" is null or "creditCap" >= 0),
  "joinedAt"  timestamptz not null default now(),
  primary key ("labId", "userId")
);
-- one lab per person (guests may join projects of several labs)
create unique index if not exists lab_member_one on lab_member ("userId") where role <> 'guest';

-- An invitation: by email (single use, expires; only the token's hash is
-- kept) or the lab's share link (email null, reusable until turned off; its
-- token is kept so admins can copy the link again).
create table if not exists lab_invite (
  id           text        primary key,
  "labId"      text        not null references lab(id) on delete cascade,
  email        text,
  role         text        not null check (role in ('admin', 'member', 'guest')),
  -- a guest's project and what they may do there
  "projectId"  text,
  access       text        check (access is null or access in ('view', 'edit')),
  "tokenHash"  text        not null unique,
  token        text,
  "createdBy"  text        references "user"(id) on delete set null,
  "createdAt"  timestamptz not null default now(),
  "expiresAt"  timestamptz,
  "usedAt"     timestamptz
);
create index if not exists lab_invite_lab on lab_invite ("labId");

-- A guest's (or a limited member's) access to one lab project.
create table if not exists lab_project_access (
  "labId"      text        not null references lab(id) on delete cascade,
  "projectId"  text        not null references shelf_project(id) on delete cascade,
  "userId"     text        not null references "user"(id) on delete cascade,
  access       text        not null check (access in ('view', 'edit')),
  primary key ("projectId", "userId")
);

-- Who added a paper to a lab's shelf. Set from the request's actor (the
-- session setting cz.actor) when a member works in the lab; empty otherwise.
alter table shelf_item add column if not exists "addedBy" text;
create or replace function shelf_item_added_by() returns trigger language plpgsql as $$
begin
  if new."addedBy" is null then new."addedBy" := nullif(current_setting('cz.actor', true), ''); end if;
  return new;
end $$;
drop trigger if exists shelf_item_added_by on shelf_item;
create trigger shelf_item_added_by before insert on shelf_item for each row execute function shelf_item_added_by();

-- Lab skills: shared with the lab's members (admins write them).
alter table user_skill add column if not exists "labId" text references lab(id) on delete cascade;

-- Chats inside a lab project: visible to the project's people; who wrote each message.
-- (a deleted lab's chats stay with the people who started them)
alter table agent_conversation add column if not exists "labId" text references lab(id) on delete set null;
alter table agent_conversation add column if not exists "projectId" text;
create index if not exists agent_conversation_lab on agent_conversation ("labId", "updatedAt" desc) where "labId" is not null;
alter table agent_message add column if not exists "authorId" text;
`;
