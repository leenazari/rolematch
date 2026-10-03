-- Keep the fast two-chunk critique and parallel research in the same private job.
alter table public.pitch_reports
  add column if not exists split_report boolean not null default false,
  add column if not exists core_critique jsonb,
  add column if not exists core_usage jsonb,
  add column if not exists research_response_id text,
  add column if not exists research_status text not null default 'idle',
  add column if not exists research_result jsonb,
  add column if not exists research_usage jsonb,
  add column if not exists research_cursor bigint not null default -1,
  add column if not exists research_updated_at timestamptz;
