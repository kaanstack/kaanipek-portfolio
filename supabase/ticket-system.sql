-- KaaniPek ticket system
-- Run this script once in Supabase Dashboard > SQL Editor.
-- Public users can create tickets and read only status metadata by an unguessable reference.
-- Contact details and message content remain private behind RLS.

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    ticket_number text not null unique,
    name text not null,
    email text not null,
    category text not null check (category in ('internship', 'collaboration', 'technical', 'general')),
    priority text not null check (priority in ('normal', 'high', 'low')),
    message text not null,
    status text not null default 'received' check (status in ('received', 'in_progress', 'resolved', 'closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists tickets_created_at_idx on public.tickets (created_at desc);
create index if not exists tickets_status_idx on public.tickets (status);

alter table public.tickets enable row level security;

drop policy if exists "Ticket admin can manage records" on public.tickets;
create policy "Ticket admin can manage records"
on public.tickets
for all
to authenticated
using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

revoke all on public.tickets from anon, authenticated;
grant select, insert, update, delete on public.tickets to authenticated;

create or replace function public.set_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_ticket_updated_at();

create or replace function public.create_ticket(
    p_name text,
    p_email text,
    p_category text,
    p_priority text,
    p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ticket_number text;
begin
    if length(btrim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then
        raise exception 'Invalid name';
    end if;
    if length(btrim(coalesce(p_email, ''))) > 254
       or btrim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
        raise exception 'Invalid email';
    end if;
    if p_category not in ('internship', 'collaboration', 'technical', 'general') then
        raise exception 'Invalid category';
    end if;
    if p_priority not in ('normal', 'high', 'low') then
        raise exception 'Invalid priority';
    end if;
    if length(btrim(coalesce(p_message, ''))) < 5 or length(p_message) > 5000 then
        raise exception 'Invalid message';
    end if;

    v_ticket_number := 'VKI-' || to_char(now(), 'YYYY') || '-' ||
        upper(replace(gen_random_uuid()::text, '-', ''));

    insert into public.tickets (ticket_number, name, email, category, priority, message)
    values (v_ticket_number, btrim(p_name), lower(btrim(p_email)), p_category, p_priority, btrim(p_message));

    return jsonb_build_object('ticket_number', v_ticket_number);
end;
$$;

create or replace function public.get_ticket_status(p_ticket_number text)
returns table (
    ticket_number text,
    status text,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select t.ticket_number, t.status, t.created_at
    from public.tickets t
    where t.ticket_number = upper(regexp_replace(btrim(coalesce(p_ticket_number, '')), '^#', ''));
$$;

revoke all on function public.create_ticket(text, text, text, text, text) from public;
revoke all on function public.get_ticket_status(text) from public;
grant execute on function public.create_ticket(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_ticket_status(text) to anon, authenticated;

-- The two RPC functions intentionally return no personal data.
-- Do not add public SELECT access to the tickets table.
