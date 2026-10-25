-- SmartPrint V2 Windows print-agent pairing.
-- Run once in the SmartPrint V2 Supabase SQL Editor before using the Windows agent.
create table if not exists public.print_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null default 'Windows print station',
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists print_devices_shop_idx on public.print_devices(shop_id);
alter table public.print_devices enable row level security;
-- No client policies: only server routes using the service-role client may access print_devices.
