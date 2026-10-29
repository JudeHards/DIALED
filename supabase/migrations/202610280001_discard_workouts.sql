-- Let owners discard unfinished sessions. Completed workouts remain permanent history.
create or replace function public.delete_workout(p_id uuid, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare old public.workouts;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into old from public.workouts where id=p_id and user_id=auth.uid() for update;
  -- Already discarded: a retry after a lost response succeeds without effect.
  if not found then return; end if;
  if old.status <> 'in_progress' then raise exception 'Completed workouts cannot be discarded' using errcode='22023'; end if;
  -- Another device logged to this session since this device last saw it.
  if old.version <> p_expected_version then raise exception 'Workout changed on another device' using errcode='PT409'; end if;
  delete from public.workouts where id=p_id;
end $$;
revoke all on function public.delete_workout(uuid,integer) from public;
grant execute on function public.delete_workout(uuid,integer) to authenticated;
