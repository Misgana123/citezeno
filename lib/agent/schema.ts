/* Research agent tables, run by `npm run db:migrate` (and by the tests, in a
   throwaway schema). Safe to run again.

   Conversations are private to their user (deleted with the account) and are
   never used to train AI. */
export const AGENT_SQL = `
create table if not exists agent_conversation (
  id            text        primary key,
  "userId"      text        not null references "user"(id) on delete cascade,
  title         text        not null,
  model         text        not null,
  -- a step waiting for the user (a confirmation), and the turn it belongs to
  pending       jsonb,
  -- set while a reply is being worked on, so two can't run at once
  "runningUntil" timestamptz,
  "costUsd"     double precision not null default 0,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);
create index if not exists agent_conversation_user on agent_conversation ("userId", "updatedAt" desc);
-- pinned to the top of the user's chat list
alter table agent_conversation add column if not exists pinned boolean not null default false;

-- One message of a conversation, in the vendor-neutral chat format, with what
-- the chat page shows for it (the steps of a tool turn).
create table if not exists agent_message (
  "conversationId" text        not null references agent_conversation(id) on delete cascade,
  seq              integer     not null,
  role             text        not null check (role in ('user', 'assistant', 'tool')),
  content          jsonb       not null,
  ui               jsonb,
  "costUsd"        double precision not null default 0,
  "createdAt"      timestamptz not null default now(),
  primary key ("conversationId", seq)
);
`;
