-- Sprint 01: Initial setup - PostGIS, pgvector, health check function

-- Enable PostGIS extension for geospatial queries
create extension if not exists postgis with schema extensions;

-- Enable pgvector extension for semantic search and RAG
create extension if not exists vector with schema extensions;

-- Create public.health_check() function for API health checks (backend access)
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

-- Grant execute to service role (backend) only - frontend uses API not direct DB
grant execute on function public.health_check() to service_role;

-- Create audit_log table for future RLS and change tracking
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  action text not null,
  user_id uuid,
  changes jsonb,
  created_at timestamp with time zone default now()
);

-- Enable RLS (allow all for now, will restrict by role in future)
alter table public.audit_log enable row level security;

create policy "audit_log_all_access" on public.audit_log
  for all using (true);

comment on table public.audit_log is 'Audit log for tracking data changes across the application';
