create table if not exists public.pitch_sessions (
  id uuid primary key,
  access_token_hash text not null check (length(access_token_hash) = 64),
  company_name text not null,
  state jsonb not null,
  conversation jsonb not null default '[]'::jsonb,
  current_question integer not null default 1 check (current_question between 1 and 7),
  revision bigint not null default 0 check (revision >= 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists pitch_sessions_updated_at_idx on public.pitch_sessions (updated_at desc);
alter table public.pitch_sessions enable row level security;
revoke all on public.pitch_sessions from public, anon, authenticated;
grant select, insert, update on public.pitch_sessions to service_role;

create table if not exists public.pitch_email_outbox (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.pitch_reports(id),
  recipient_role text not null check (recipient_role in ('owner', 'participant')),
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'awaiting_configuration', 'sending', 'sent', 'failed')),
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (report_id, recipient_role)
);
alter table public.pitch_email_outbox enable row level security;
revoke all on public.pitch_email_outbox from public, anon, authenticated;
grant select, insert, update on public.pitch_email_outbox to service_role;
