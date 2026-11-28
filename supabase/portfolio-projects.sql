-- KaaniPek portfolio projects
-- Run in Supabase Dashboard > SQL Editor.
-- Public visitors can read published projects; only the site owner can manage records.

create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title_tr text not null check (char_length(btrim(title_tr)) between 2 and 140),
  title_en text not null check (char_length(btrim(title_en)) between 2 and 140),
  description_tr text not null check (char_length(btrim(description_tr)) between 10 and 600),
  description_en text not null check (char_length(btrim(description_en)) between 10 and 600),
  category text not null check (char_length(btrim(category)) between 2 and 50),
  technologies text[] not null default '{}'
    check (cardinality(technologies) between 1 and 12),
  github_url text check (github_url is null or (char_length(github_url) <= 500 and github_url ~ '^https://')),
  live_url text check (live_url is null or (char_length(live_url) <= 500 and live_url ~ '^https://')),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_projects_public_order_idx
  on public.portfolio_projects (is_published, sort_order, created_at desc);

alter table public.portfolio_projects enable row level security;
revoke all on public.portfolio_projects from anon, authenticated;
grant select on public.portfolio_projects to anon, authenticated;
grant insert, update, delete on public.portfolio_projects to authenticated;

drop policy if exists "Published portfolio projects are public" on public.portfolio_projects;
create policy "Published portfolio projects are public"
on public.portfolio_projects for select to anon, authenticated
using (is_published or auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

drop policy if exists "Site owner manages portfolio projects" on public.portfolio_projects;
create policy "Site owner manages portfolio projects"
on public.portfolio_projects for all to authenticated
using (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid)
with check (auth.uid() = '03347b3f-833f-4ff0-97d0-2dd1e4348b3f'::uuid);

create or replace function public.set_portfolio_project_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_projects_set_updated_at on public.portfolio_projects;
create trigger portfolio_projects_set_updated_at
before update on public.portfolio_projects
for each row execute function public.set_portfolio_project_updated_at();

insert into public.portfolio_projects
(title_tr,title_en,description_tr,description_en,category,technologies,live_url,github_url,sort_order,is_published)
select
  'kaanipek.net.tr Bulut & Ağ Mimarisi',
  'kaanipek.net.tr Cloud & Network Architecture',
  'Metunic alan adı yönetimi, Cloudflare Nameserver devri, uçtan uca TLS şifrelemesi, özel kurumsal e-posta yönlendirme (MX/SPF) ve sıfır sunucu maliyetli statik CDN dağıtım altyapısı.',
  'Metunic domain management, Cloudflare Nameserver delegation, end-to-end TLS encryption, custom email routing (MX/SPF), and zero-server-cost static CDN deployment architecture.',
  'Cloud & DNS', array['Cloudflare','DNS/TLS','Static CDN'], 'https://kaanipek.net.tr', null, 10, true
where not exists (select 1 from public.portfolio_projects where title_tr='kaanipek.net.tr Bulut & Ağ Mimarisi');

insert into public.portfolio_projects
(title_tr,title_en,description_tr,description_en,category,technologies,sort_order,is_published)
select
  'Ticket & Talep Yönetim Sistemi',
  'Ticket & Request Management System',
  'Ziyaretçilerin talep oluşturabildiği, takip numarasıyla durum sorgulayabildiği ve yönetim panelinden süreçlerin takip edilebildiği uçtan uca talep sistemi.',
  'An end-to-end request system where visitors can submit tickets and track their status, while requests are managed through a private admin panel.',
  'Supabase', array['JavaScript','Supabase','PostgreSQL'], 20, true
where not exists (select 1 from public.portfolio_projects where title_tr='Ticket & Talep Yönetim Sistemi');

insert into public.portfolio_projects
(title_tr,title_en,description_tr,description_en,category,technologies,github_url,sort_order,is_published)
select
  'Tech Radar — Teknoloji Gündemi',
  'Tech Radar — Technology Briefing',
  'Hacker News verilerini kullanarak teknoloji haberlerini kategorilere ayıran, başlıkları Türkçeleştiren ve detay sayfalarında kaynak bağlantıları sunan haber akışı.',
  'A technology news feed using Hacker News data, with category filters, Turkish title translation, and source links on detail pages.',
  'Tech Radar', array['Hacker News API','JavaScript','REST'], 'https://github.com/kaanstack/kaanipek-portfolio', 30, true
where not exists (select 1 from public.portfolio_projects where title_tr='Tech Radar — Teknoloji Gündemi');
