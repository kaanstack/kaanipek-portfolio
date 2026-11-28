-- KaaniPek admin panel V2 migration
-- Run once in Supabase Dashboard > SQL Editor.
-- Adds ticket archiving and a private release/version history table.

alter table public.tickets
  add column if not exists archived_at timestamptz;

create index if not exists tickets_active_created_at_idx
  on public.tickets (created_at desc)
  where archived_at is null;

create index if not exists tickets_archived_created_at_idx
  on public.tickets (archived_at desc, created_at desc)
  where archived_at is not null;

create table if not exists public.site_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(btrim(version)) between 1 and 30),
  release_notes text not null check (length(btrim(release_notes)) between 1 and 4000),
  commit_url text,
  released_at timestamptz not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint site_versions_commit_url_check check (
    commit_url is null or commit_url ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/commit/[A-Fa-f0-9]+(\?.*)?$'
  )
);

create index if not exists site_versions_released_at_idx
  on public.site_versions (released_at desc);

create unique index if not exists site_versions_one_current_idx
  on public.site_versions (is_current)
  where is_current = true;

alter table public.site_versions enable row level security;

drop policy if exists "Site versions admin access" on public.site_versions;
create policy "Site versions admin access"
on public.site_versions
for all
to authenticated
using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

revoke all on public.site_versions from anon, authenticated;
grant select, insert, update, delete on public.site_versions to authenticated;

-- Only the authenticated admin can archive, restore, or permanently delete tickets
-- through the existing tickets RLS policy.
grant update (archived_at) on public.tickets to authenticated;
