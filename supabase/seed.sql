-- Seed data for development environment
-- This file will be executed after migrations during local development

-- Add sample audit entries
insert into public.audit_log (table_name, action, changes) values
  ('health_check', 'test', '{"message": "Application initialized"}'::jsonb),
  ('system', 'startup', '{"environment": "development", "timestamp": "' || now() || '"}'::jsonb);
