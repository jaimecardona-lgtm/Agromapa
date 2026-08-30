-- Initial setup: PostGIS, pgvector, health_check function

-- Enable PostGIS extension
create extension if not exists postgis with schema extensions;

-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Create public.health_check() function for API health checks
create or replace function public.health_check()
returns table (
  status text,
  timestamp timestamp with time zone,
  version text
) as $$
begin
  return query select
    'healthy'::text,
    now(),
    '0.1.0'::text;
end;
$$ language plpgsql;

-- Grant execute permissions
grant execute on function public.health_check() to anon, authenticated;

-- Create initial audit table for RLS preparation
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  action text not null,
  user_id uuid,
  changes jsonb,
  created_at timestamp with time zone default now()
);

-- Enable RLS on audit_log (but allow all access for now)
alter table public.audit_log enable row level security;

comment on table public.audit_log is 'Audit log for tracking data changes across the application';
