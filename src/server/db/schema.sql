-- walkthrough prototype — seam A. Applied idempotently by `npm run db:push` (scripts/db-push.mjs).
-- Every statement is IF NOT EXISTS so a second push is a no-op.

create table if not exists projects (
  id   text primary key,
  name text
);

create table if not exists rounds (
  project    text        not null references projects (id) on delete cascade,
  n          int         not null,
  kind       text        not null check (kind in ('wireframe', 'screenshots')),
  -- 'uploading' = a screenshots round still waiting for declared pictures (hidden from the reviewer)
  status     text        not null default 'open' check (status in ('uploading', 'open', 'answered', 'closed')),
  viewports  jsonb,
  created_at timestamptz not null default now(),
  primary key (project, n)
);

create table if not exists journeys (
  project text  not null,
  round   int   not null,
  id      text  not null,
  title   text,
  persona text,
  steps   jsonb not null,
  beats   text,
  primary key (project, round, id),
  foreign key (project, round) references rounds (project, n) on delete cascade
);

create table if not exists screens (
  project text  not null,
  round   int   not null,
  name    text  not null,
  state   text  not null,
  spec    jsonb,
  primary key (project, round, name, state),
  foreign key (project, round) references rounds (project, n) on delete cascade
);

-- Deviation (README): push order, so the sidebar and a screen's default state follow what the
-- caller sent instead of alphabetical order.
alter table journeys add column if not exists ord int not null default 0;
alter table screens add column if not exists ord int not null default 0;

-- docs/design/client-view.md §5 (the stories page): who a story is about, and the main story an
-- alternate path belongs to (the id of another journey of the same round, itself not a variant).
-- Both optional; rows pushed before they existed read as null.
alter table journeys add column if not exists actor text;
alter table journeys add column if not exists variant_of text;

-- One row per DECLARED picture. `bytes` is null until the PUT arrives; a screenshots round turns
-- 'open' when no row of it has null bytes left.
create table if not exists images (
  project text  not null,
  round   int   not null,
  name    text  not null,
  state   text  not null,
  width   int   not null,
  bytes   bytea,
  primary key (project, round, name, state, width),
  foreign key (project, round) references rounds (project, n) on delete cascade
);

create table if not exists notes (
  project      text        not null references projects (id) on delete cascade,
  id           text        not null,
  round        int         not null,
  screen       text,
  state        text,
  anchor       jsonb,
  status       text        not null,
  thread       jsonb       not null default '[]'::jsonb,
  project_note bool        not null default false,
  created_at   timestamptz not null default now(),
  primary key (project, id)
);
-- Deviation from the plan's seam A (see src/server/walkthrough/README.md): the page-owned
-- passthrough extras of today's Note (snippet, whole, rect, viewport, component, key, ...) live here
-- so they round-trip exactly as they do through today's notes.json.
alter table notes add column if not exists extra jsonb not null default '{}'::jsonb;

create table if not exists journey_threads (
  project text  not null references projects (id) on delete cascade,
  journey text  not null,
  status  text  not null,
  thread  jsonb not null default '[]'::jsonb,
  primary key (project, journey)
);

create table if not exists approvals (
  project text        not null references projects (id) on delete cascade,
  journey text        not null,
  by      text        not null,
  round   int         not null,
  beats   text        not null,
  at      timestamptz not null default now(),
  reason  text,
  primary key (project, journey)
);
