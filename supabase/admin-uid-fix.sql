-- Correct the ticket administrator UUID to the authenticated Supabase user.
-- Run this once in Supabase Dashboard > SQL Editor.

drop policy if exists "Ticket admin can manage records" on public.tickets;

create policy "Ticket admin can manage records"
on public.tickets
for all
to authenticated
using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);
