create table public.pitch_reports (
  id uuid primary key,
  access_token_hash text not null check (length(access_token_hash) = 64),
  company_name text not null,
  pitch_data jsonb not null,
  conversation jsonb not null,
  report_input text not null,
  report_instructions text not null,
  model text not null,
  status text not null default 'starting' check (status in ('starting', 'processing', 'ready', 'failed')),
  response_id text,
  critique jsonb,
  pdf_path text,
  token_usage jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pitch_reports enable row level security;
revoke all on public.pitch_reports from anon, authenticated;
grant select, insert, update, delete on public.pitch_reports to service_role;
create index pitch_reports_created_at_idx on public.pitch_reports (created_at desc);
comment on table public.pitch_reports is 'Private Pitch Perfect reports. Server-only access; guest report tokens are hashed.';
