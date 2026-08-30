-- Seed data for development environment
-- This file will be executed after migrations during local development

-- Add sample audit entries with proper JSON construction
insert into public.audit_log (table_name, action, changes) values
  (
    'system',
    'startup',
    jsonb_build_object(
      'message', 'Application initialized',
      'environment', 'development',
      'timestamp', now()::text
    )
  ),
  (
    'database',
    'migrations_applied',
    jsonb_build_object(
      'extensions', jsonb_build_array('postgis', 'pgvector'),
      'functions', jsonb_build_array('health_check'),
      'timestamp', now()::text
    )
  );
