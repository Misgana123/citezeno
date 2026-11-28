/* Skills (lib/skills), run by `npm run db:migrate` (and by the tests, in a
   throwaway schema). Safe to run again.

   One row per skill a user has: a built-in skill they added ("builtin" is its
   slug; its text lives in code) or one they wrote. Rows go with the account. */
export const SKILLS_SQL = `
create table if not exists user_skill (
  id             text        primary key,
  "userId"       text        not null references "user"(id) on delete cascade,
  builtin        text,
  name           text        not null,
  description    text        not null default '',
  instructions   text        not null default '',
  enabled        boolean     not null default true,
  uses           integer     not null default 0,
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);
create unique index if not exists user_skill_builtin on user_skill ("userId", builtin) where builtin is not null;
create unique index if not exists user_skill_name on user_skill ("userId", lower(name));
`;
