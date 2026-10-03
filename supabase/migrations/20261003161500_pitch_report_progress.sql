-- Stream checkpoints belong to the existing private, capability-protected report row.
alter table public.pitch_reports
  add column if not exists streaming boolean not null default false,
  add column if not exists stream_cursor bigint not null default -1,
  add column if not exists stream_text text not null default '',
  add column if not exists partial_critique jsonb;
