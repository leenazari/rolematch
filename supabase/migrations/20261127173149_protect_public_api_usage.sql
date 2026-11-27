-- Shared counters for serverless instances. No client credentials, addresses or pitch content.
create table public.pitch_api_usage (
  actor_hash text not null check (length(actor_hash) = 64),
  bucket text not null,
  window_start bigint not null,
  calls integer not null check (calls >= 1),
  primary key (actor_hash, bucket)
);
create index pitch_api_usage_expiry on public.pitch_api_usage (window_start);
alter table public.pitch_api_usage enable row level security;
revoke all on table public.pitch_api_usage from public, anon, authenticated;
grant select, insert, update, delete on public.pitch_api_usage to service_role;

create function public.consume_pitch_api_usage(p_actor text, p_bucket text, p_limit integer)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  slot bigint := floor(extract(epoch from statement_timestamp()) / 600)::bigint;
  accepted integer;
begin
  if p_actor !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 600
     or p_bucket not in ('upload','interview','audio','report','session','email') then
    return false;
  end if;
  insert into public.pitch_api_usage as u (actor_hash, bucket, window_start, calls)
    values (p_actor, p_bucket, slot, 1)
  on conflict (actor_hash, bucket) do update
    set window_start = excluded.window_start,
        calls = case when u.window_start < excluded.window_start then 1 else u.calls + 1 end
    where u.window_start < excluded.window_start or
          (u.window_start = excluded.window_start and u.calls < p_limit)
  returning calls into accepted;
  if random() < 0.01 then
    delete from public.pitch_api_usage u where (u.actor_hash, u.bucket) in
      (select old.actor_hash, old.bucket from public.pitch_api_usage old where old.window_start < slot - 144 limit 128);
  end if;
  return accepted is not null;
end;
$$;
revoke all on function public.consume_pitch_api_usage(text,text,integer) from public, anon, authenticated;
grant execute on function public.consume_pitch_api_usage(text,text,integer) to service_role;
