-- KaaniPek Development Journal
-- Run once in Supabase Dashboard > SQL Editor.
-- Public visitors can read published entries only; only the site owner can manage records.

create table if not exists public.development_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 140),
  category text not null check (category in ('learning', 'project', 'event', 'milestone', 'experience')),
  summary text not null check (char_length(btrim(summary)) between 5 and 280),
  details text check (details is null or char_length(details) <= 1800),
  event_date date not null default current_date,
  link_url text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^https://')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists development_entries_public_date_idx
  on public.development_entries (is_published, event_date desc, created_at desc);

alter table public.development_entries enable row level security;
revoke all on public.development_entries from anon, authenticated;
grant select on public.development_entries to anon, authenticated;
grant insert, update, delete on public.development_entries to authenticated;

drop policy if exists "Published development entries are public" on public.development_entries;
create policy "Published development entries are public"
on public.development_entries for select to anon, authenticated
using (is_published or auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

drop policy if exists "Site owner manages development entries" on public.development_entries;
create policy "Site owner manages development entries"
on public.development_entries for all to authenticated
using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

create or replace function public.set_development_entry_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists development_entries_set_updated_at on public.development_entries;
create trigger development_entries_set_updated_at
before update on public.development_entries
for each row execute function public.set_development_entry_updated_at();
