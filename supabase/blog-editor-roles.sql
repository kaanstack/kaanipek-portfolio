-- Blog editor roles and editorial approval workflow
-- Run once in Supabase Dashboard > SQL Editor before inviting editors.

-- Extend existing posts without changing the publication state of current articles.
alter table public.posts
  add column if not exists status text not null default 'published',
  add column if not exists author_id uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists review_note text;

alter table public.posts
  drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status in ('draft', 'pending', 'published', 'changes_requested'));

create index if not exists posts_status_created_at_idx
  on public.posts (status, created_at desc);
create index if not exists posts_author_created_at_idx
  on public.posts (author_id, created_at desc);

-- Only the site owner can grant or revoke editor access.
create table if not exists public.blog_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('editor')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.blog_user_roles enable row level security;
revoke all on public.blog_user_roles from anon, authenticated;
grant select on public.blog_user_roles to authenticated;

create or replace function public.is_blog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid;
$$;

create or replace function public.is_blog_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blog_user_roles r
    where r.user_id = auth.uid() and r.role = 'editor'
  );
$$;

create or replace function public.has_blog_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_blog_admin() or public.is_blog_editor();
$$;

revoke all on function public.is_blog_admin() from public;
revoke all on function public.is_blog_editor() from public;
revoke all on function public.has_blog_access() from public;
grant execute on function public.is_blog_admin() to authenticated;
grant execute on function public.is_blog_editor() to authenticated;
grant execute on function public.has_blog_access() to authenticated;

drop policy if exists "Blog roles readable by owner" on public.blog_user_roles;
create policy "Blog roles readable by owner"
on public.blog_user_roles for select to authenticated
using (auth.uid() = user_id or public.is_blog_admin());

-- Replace posts policies to avoid permissive legacy policies bypassing the workflow.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'posts'
  loop
    execute format('drop policy if exists %I on public.posts', p.policyname);
  end loop;
end $$;

alter table public.posts enable row level security;
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

create policy "Published blog posts are public"
on public.posts for select to anon, authenticated
using (status = 'published' or public.is_blog_admin() or (public.is_blog_editor() and author_id = auth.uid()));

create policy "Blog admins manage all posts"
on public.posts for all to authenticated
using (public.is_blog_admin())
with check (public.is_blog_admin());

create policy "Editors submit their own posts for review"
on public.posts for insert to authenticated
with check (
  public.is_blog_editor()
  and author_id = auth.uid()
  and status = 'pending'
);

create policy "Editors update their own unapproved posts"
on public.posts for update to authenticated
using (
  public.is_blog_editor()
  and author_id = auth.uid()
  and status in ('draft', 'pending', 'changes_requested')
)
with check (
  public.is_blog_editor()
  and author_id = auth.uid()
  and status in ('draft', 'pending', 'changes_requested')
);

-- Editors may upload cover images to the existing public blog-covers bucket.
drop policy if exists "Blog editors upload covers" on storage.objects;
create policy "Blog editors upload covers"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'blog-covers'
  and public.is_blog_editor()
);
