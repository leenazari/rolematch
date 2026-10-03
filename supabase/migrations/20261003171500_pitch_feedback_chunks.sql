-- Independent opening and detail responses remove reliance on model key order.
alter table public.pitch_reports
  add column if not exists two_chunks boolean not null default false,
  add column if not exists opening_response_id text,
  add column if not exists opening_result jsonb,
  add column if not exists opening_usage jsonb,
  add column if not exists feedback_stage text not null default 'opening';
