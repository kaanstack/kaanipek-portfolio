-- Account inventory for the private admin panel.
-- Stores account metadata only. NEVER add passwords, recovery codes, API keys, or tokens here.

create table if not exists public.account_inventory (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (char_length(trim(platform)) between 1 and 80),
  username text,
  login_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_inventory enable row level security;

drop policy if exists "Admin can read account inventory" on public.account_inventory;
create policy "Admin can read account inventory"
  on public.account_inventory for select
  to authenticated
  using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

drop policy if exists "Admin can add account inventory" on public.account_inventory;
create policy "Admin can add account inventory"
  on public.account_inventory for insert
  to authenticated
  with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

drop policy if exists "Admin can update account inventory" on public.account_inventory;
create policy "Admin can update account inventory"
  on public.account_inventory for update
  to authenticated
  using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
  with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

drop policy if exists "Admin can delete account inventory" on public.account_inventory;
create policy "Admin can delete account inventory"
  on public.account_inventory for delete
  to authenticated
  using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

grant select, insert, update, delete on public.account_inventory to authenticated;
