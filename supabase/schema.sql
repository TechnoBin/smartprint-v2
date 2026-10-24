-- SmartPrint V2 initial schema.
-- Run in a NEW/test Supabase project first. Do not run blindly against V1 production data.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  shop_code text not null unique check (shop_code ~ '^[a-z0-9-]{3,40}$'),
  bw_price numeric(10,2) not null default 2 check (bw_price >= 0 and bw_price <= 1000),
  color_price numeric(10,2) not null default 5 check (color_price >= 0 and color_price <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  pages integer not null check (pages between 1 and 1000),
  copies integer not null default 1 check (copies between 1 and 100),
  print_type text not null check (print_type in ('bw','color')),
  price numeric(10,2) not null check (price >= 0),
  status text not null default 'pending' check (status in ('pending','printing','printed','failed')),
  customer_name text,
  error_message text,
  created_at timestamptz not null default now(),
  printed_at timestamptz
);

create index if not exists print_jobs_shop_created_idx on public.print_jobs(shop_id, created_at desc);
create index if not exists print_jobs_status_idx on public.print_jobs(status);

alter table public.shops enable row level security;
alter table public.print_jobs enable row level security;

drop policy if exists "owners read own shop" on public.shops;
create policy "owners read own shop" on public.shops for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "owners update own shop" on public.shops;
create policy "owners update own shop" on public.shops for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "owners read own jobs" on public.print_jobs;
create policy "owners read own jobs" on public.print_jobs for select to authenticated
using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

drop policy if exists "owners update own jobs" on public.print_jobs;
create policy "owners update own jobs" on public.print_jobs for update to authenticated
using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())))
with check (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

-- Create this bucket as PRIVATE. Server route uses the service-role key, never the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-files', 'print-files', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

-- IMPORTANT:
-- Do not create anon insert/read policies for print_jobs or public file access.
-- Public uploads are processed by a server API route that validates the PDF and calculates price.
-- Service-role key must exist only in server environment variables.
