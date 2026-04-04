-- =============================================
-- 创意集市 IdeaBazaar MVP Schema
-- Run this in Supabase SQL Editor to initialize
-- =============================================

-- Projects: one per user keyword submission
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  status      text not null default 'pending'
              check (status in ('pending','running','done','failed')),
  iteration   smallint not null default 0 check (iteration between 0 and 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Pools: 3 per project, each with an AI-assigned thematic direction
create table if not exists pools (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  slot        smallint not null check (slot between 1 and 3),
  direction   text not null,
  created_at  timestamptz not null default now(),
  unique (project_id, slot)
);

-- Ideas: 12 per pool, each tracks current best version
create table if not exists ideas (
  id                  uuid primary key default gen_random_uuid(),
  pool_id             uuid not null references pools(id) on delete cascade,
  slot                smallint not null check (slot between 1 and 12),
  current_version_id  uuid,
  total_score         numeric(5,2) not null default 0,
  rank                smallint,
  trend               text default 'same' check (trend in ('up','down','same')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (pool_id, slot)
);

-- Idea versions: immutable record of each iteration's output
create table if not exists idea_versions (
  id              uuid primary key default gen_random_uuid(),
  idea_id         uuid not null references ideas(id) on delete cascade,
  iteration       smallint not null check (iteration between 0 and 3),
  content         text not null,
  score_innovation  numeric(5,2) not null,
  score_feasibility numeric(5,2) not null,
  score_impact      numeric(5,2) not null,
  total_score       numeric(5,2) not null,
  ai_changes      text,
  created_at      timestamptz not null default now()
);

-- Add FK back to ideas (after idea_versions exists)
alter table ideas
  add constraint ideas_current_version_fk
  foreign key (current_version_id) references idea_versions(id)
  deferrable initially deferred;

-- Jobs: track async iteration task state
create table if not exists jobs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  iteration   smallint not null check (iteration between 1 and 3),
  status      text not null default 'pending'
              check (status in ('pending','running','done','failed')),
  error       text,
  retry_count smallint not null default 0,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_pools_project on pools(project_id);
create index if not exists idx_ideas_pool on ideas(pool_id);
create index if not exists idx_idea_versions_idea on idea_versions(idea_id);
create index if not exists idx_ideas_score on ideas(total_score desc);
create index if not exists idx_jobs_project on jobs(project_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();

create trigger ideas_updated_at before update on ideas
  for each row execute function update_updated_at();
