-- Swap the guest recovery credential for one held by the first completed results page.
-- The private session, report and stored PDF remain unchanged apart from the access hash.
create function public.claim_pitch_results_view(p_id uuid, p_recovery_hash text, p_view_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_hash text;
  available boolean;
begin
  if p_id is null or p_recovery_hash is null or p_view_hash is null or p_recovery_hash !~ '^[0-9a-f]{64}$'
     or p_view_hash !~ '^[0-9a-f]{64}$' or p_view_hash = p_recovery_hash then
    return false;
  end if;
  select access_token_hash, critique is not null into stored_hash, available
    from public.pitch_reports where id = p_id for update;
  if not found or not available then return false; end if;
  -- Retrying the very same claim is safe after a lost HTTP acknowledgement.
  if stored_hash = p_view_hash then return true; end if;
  if stored_hash <> p_recovery_hash then return false; end if;
  update public.pitch_reports set access_token_hash = p_view_hash where id = p_id;
  update public.pitch_sessions set access_token_hash = p_view_hash
    where id = p_id and status = 'completed' and access_token_hash = p_recovery_hash;
  return true;
end;
$$;
revoke all on function public.claim_pitch_results_view(uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_pitch_results_view(uuid,text,text) to service_role;
