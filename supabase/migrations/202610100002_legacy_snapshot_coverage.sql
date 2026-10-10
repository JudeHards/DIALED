-- Preserve missing anatomy detail when legacy offline workouts first sync.
-- Existing session snapshots and mutation results are never rewritten.
create or replace function public.save_workout(p_document jsonb, p_expected_version integer, p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); wid uuid := (p_document->>'id')::uuid;
  old public.workouts; replay public.mutations; result jsonb; e jsonb; s jsonb; snap jsonb;
  ep integer := 0; sp integer; hash text := md5('workout' || p_document::text || p_expected_version::text);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version < 0 or wid is null or p_mutation_id is null
    or (p_document->>'version')::integer is distinct from p_expected_version
    then raise exception 'Invalid save metadata' using errcode='22023'; end if;
  -- Per-user serialization also prevents concurrent reuse of a mutation ID across resources.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into replay from public.mutations where user_id=uid and id=p_mutation_id;
  if found then
    if replay.request_hash <> hash then raise exception 'Mutation was reused with a different request' using errcode='PT409'; end if;
    return replay.result;
  end if;
  select * into old from public.workouts where id=wid for update;
  if found then
    if old.user_id <> uid then raise exception 'Workout not found' using errcode='42501'; end if;
    if old.version <> p_expected_version then raise exception 'Workout changed on another device' using errcode='PT409'; end if;
    if old.status='completed' then raise exception 'Completed workouts are read-only' using errcode='22023'; end if;
  elsif p_expected_version <> 0 then raise exception 'Workout not found or version changed' using errcode='PT409';
  end if;
  if old.id is null and p_document->>'routineId' is not null and not exists(select 1 from public.routines where id=(p_document->>'routineId')::uuid and user_id=uid) then raise exception 'Routine not found' using errcode='42501'; end if;
  if old.id is not null and old.started_at is distinct from (p_document->>'startedAt')::timestamptz then raise exception 'Session start cannot be changed' using errcode='22023'; end if;
  if jsonb_typeof(p_document->'exercises') is distinct from 'array' or jsonb_array_length(p_document->'exercises')>50 then raise exception 'Invalid exercises' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_document->'exercises') item group by item->>'id' having count(*)>1) then raise exception 'Duplicate exercise IDs' using errcode='22023'; end if;
  insert into public.workouts(id,user_id,routine_id,name,status,started_at,completed_at,version)
    values(wid,uid,case when old.id is null then (p_document->>'routineId')::uuid else old.routine_id end,p_document->>'name',p_document->>'status',(p_document->>'startedAt')::timestamptz,(p_document->>'completedAt')::timestamptz,p_expected_version+1)
  on conflict(id) do update set name=excluded.name,status=excluded.status,completed_at=excluded.completed_at,version=excluded.version,updated_at=now();
  for e in select value from jsonb_array_elements(p_document->'exercises') loop
    if jsonb_typeof(e->'sets') is distinct from 'array' or jsonb_array_length(e->'sets')>50 then raise exception 'Invalid sets' using errcode='22023'; end if;
    -- Preserve the original muscle snapshot; clients cannot manufacture historical anatomy.
    select snapshot into snap from public.session_exercises where id=(e->>'id')::uuid and workout_id=wid and exercise_id=e->>'exerciseId';
    if snap is null then
      select data into snap from public.exercises where id=e->>'exerciseId';
      -- A queued workout from an older client never recorded part-level detail.
      -- Use trusted catalogue identity, but do not fabricate historical anatomy
      -- when that document reaches the server for the first time.
      if snap is not null and jsonb_typeof(e->'snapshot'->'muscleTargets') is distinct from 'array' then
        snap := snap - 'muscleTargets' - 'biasNotes';
        if snap->>'primaryMuscle' in ('anterior delt', 'lateral delt', 'posterior delt')
          and (e->'snapshot'->>'primaryMuscle') is distinct from (snap->>'primaryMuscle') then
          snap := jsonb_set(snap, '{primaryMuscle}', '"shoulders"'::jsonb);
        end if;
        -- Retain a recorded explicit delt label only in its original role.
        -- Otherwise keep its involvement unassigned; collapse duplicates and
        -- remove a secondary shoulders entry when shoulders is the primary.
        snap := jsonb_set(snap, '{secondaryMuscles}', (
          select coalesce(jsonb_agg(to_jsonb(muscle) order by first_position), '[]'::jsonb)
          from (
            select case when value in ('anterior delt', 'lateral delt', 'posterior delt')
              and not coalesce((e->'snapshot'->'secondaryMuscles') ? value, false)
              then 'shoulders' else value end as muscle,
              min(ordinality) as first_position
            from jsonb_array_elements_text(snap->'secondaryMuscles') with ordinality
            group by 1
          ) mapped
          where muscle <> snap->>'primaryMuscle'
        ));
      end if;
    end if;
    if snap is null then raise exception 'Unknown exercise' using errcode='22023'; end if;
    -- Existing IDs belonging to other workouts must fail, never be moved by upsert.
    if exists(select 1 from public.session_exercises where id=(e->>'id')::uuid and (workout_id<>wid or exercise_id<>e->>'exerciseId')) then raise exception 'Exercise ID belongs to another record' using errcode='22023'; end if;
    insert into public.session_exercises(id,workout_id,exercise_id,position,prescription,snapshot)
      values((e->>'id')::uuid,wid,e->>'exerciseId',ep,e->'prescription',snap)
      on conflict(id) do update set position=excluded.position,prescription=excluded.prescription;
    delete from public.exercise_sets where session_exercise_id=(e->>'id')::uuid;
    sp:=0;
    for s in select value from jsonb_array_elements(e->'sets') loop
      if jsonb_typeof(s->'completed') is distinct from 'boolean' or jsonb_typeof(s->'warmup') is distinct from 'boolean'
        or (s->>'weight' is not null and jsonb_typeof(s->'weight') <> 'number')
        or (s->>'reps' is not null and (jsonb_typeof(s->'reps') <> 'number' or (s->>'reps')::numeric <> trunc((s->>'reps')::numeric)))
        or (s->>'rir' is not null and (jsonb_typeof(s->'rir') <> 'number' or (s->>'rir')::numeric <> trunc((s->>'rir')::numeric)))
        then raise exception 'Invalid set values' using errcode='22023'; end if;
      insert into public.exercise_sets(id,session_exercise_id,position,weight,reps,rir,completed,warmup)
        values((s->>'id')::uuid,(e->>'id')::uuid,sp,(s->>'weight')::numeric,(s->>'reps')::integer,(s->>'rir')::integer,(s->>'completed')::boolean,(s->>'warmup')::boolean);
      sp:=sp+1;
    end loop;
    ep:=ep+1;
  end loop;
  delete from public.session_exercises where workout_id=wid and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_document->'exercises'));
  if p_document->>'status'='completed' and not exists(select 1 from public.exercise_sets s join public.session_exercises e on e.id=s.session_exercise_id where e.workout_id=wid and s.completed) then raise exception 'Complete at least one set' using errcode='22023'; end if;
  result:=public.workout_document(wid);
  insert into public.mutations(user_id,id,request_hash,result) values(uid,p_mutation_id,hash,result);
  return result;
end $$;
