-- All workout writes go through atomic, owner-checked RPCs. Never use a service-role key in the app.
create table public.exercises (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id)
);
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  timezone text not null default 'UTC'
);
create table public.routines (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
create table public.routine_exercises (
  id uuid primary key,
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  position integer not null,
  prescription jsonb not null
);
create table public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null check (status in ('in_progress','completed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check (completed_at is null or completed_at >= started_at)
);
create table public.session_exercises (
  id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  position integer not null,
  prescription jsonb not null,
  snapshot jsonb not null check (snapshot->>'id' = exercise_id)
);
create table public.exercise_sets (
  id uuid primary key,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  position integer not null,
  weight numeric check (weight between 0 and 2000),
  reps integer check (reps between 1 and 1000),
  rir integer check (rir between 0 and 10),
  completed boolean not null,
  warmup boolean not null,
  check (not completed or (weight is not null and reps is not null))
);
create table public.mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,id)
);
create index workouts_user_date on public.workouts(user_id, completed_at desc);
create index routines_user on public.routines(user_id);
create index routine_exercises_parent on public.routine_exercises(routine_id);
create index session_exercises_parent on public.session_exercises(workout_id);
create index sets_parent on public.exercise_sets(session_exercise_id);

alter table public.exercises enable row level security;
alter table public.profiles enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.session_exercises enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.mutations enable row level security;
create policy catalogue_read on public.exercises for select to authenticated using (true);
create policy own_profile on public.profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_routines on public.routines for select to authenticated using (user_id = (select auth.uid()));
create policy own_routine_exercises on public.routine_exercises for select to authenticated using (exists(select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy own_workouts on public.workouts for select to authenticated using (user_id = (select auth.uid()));
create policy own_session_exercises on public.session_exercises for select to authenticated using (exists(select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));
create policy own_sets on public.exercise_sets for select to authenticated using (exists(select 1 from public.session_exercises e join public.workouts w on w.id = e.workout_id where e.id = session_exercise_id and w.user_id = (select auth.uid())));
-- No direct mutation ledger access: replay checks happen inside the RPC transaction.
revoke all on public.exercises, public.profiles, public.routines, public.routine_exercises, public.workouts, public.session_exercises, public.exercise_sets, public.mutations from anon, authenticated;
grant select on public.exercises, public.profiles, public.routines, public.routine_exercises, public.workouts, public.session_exercises, public.exercise_sets to authenticated;
grant insert, update on public.profiles to authenticated;

create function public.workout_document(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',w.id,'name',w.name,'version',w.version,'routineId',w.routine_id,'status',w.status,
    'startedAt',to_char(w.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'completedAt',case when w.completed_at is null then null else to_char(w.completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'exercises',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'snapshot',e.snapshot,'prescription',e.prescription,
      'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'weight',s.weight,'reps',s.reps,'rir',s.rir,'completed',s.completed,'warmup',s.warmup) order by s.position) from public.exercise_sets s where s.session_exercise_id=e.id),'[]'::jsonb)) order by e.position)
      from public.session_exercises e where e.workout_id=w.id),'[]'::jsonb))
  from public.workouts w where w.id=p_id;
$$;
create function public.routine_document(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'version',r.version,'exercises',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'prescription',e.prescription) order by e.position) from public.routine_exercises e where e.routine_id=r.id),'[]'::jsonb)) from public.routines r where r.id=p_id;
$$;
create function public.valid_prescription(p jsonb) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p)='object' and (p->>'workingSets')::numeric between 1 and 20
    and (p->>'workingSets')::numeric = trunc((p->>'workingSets')::numeric)
    and (p->>'repMin')::numeric between 1 and 100 and (p->>'repMin')::numeric = trunc((p->>'repMin')::numeric)
    and (p->>'repMax')::numeric between (p->>'repMin')::numeric and 100 and (p->>'repMax')::numeric = trunc((p->>'repMax')::numeric)
    and (p->>'incrementKg')::numeric > 0 and (p->>'incrementKg')::numeric <= 100, false);
$$;
alter table public.routine_exercises add check (public.valid_prescription(prescription));
alter table public.session_exercises add check (public.valid_prescription(prescription));

create function public.save_workout(p_document jsonb, p_expected_version integer, p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); wid uuid := (p_document->>'id')::uuid;
  old public.workouts; replay public.mutations; result jsonb; e jsonb; s jsonb; snap jsonb;
  ep integer := 0; sp integer; hash text := md5('workout' || p_document::text || p_expected_version::text);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Per-user serialization also prevents concurrent reuse of a mutation ID across resources.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into replay from public.mutations where user_id=uid and id=p_mutation_id;
  if found then
    if replay.request_hash <> hash then raise exception 'Mutation was reused with a different request' using errcode='40001'; end if;
    return replay.result;
  end if;
  select * into old from public.workouts where id=wid for update;
  if found then
    if old.user_id <> uid then raise exception 'Workout not found' using errcode='42501'; end if;
    if old.version <> p_expected_version then raise exception 'Workout changed on another device' using errcode='40001'; end if;
    if old.status='completed' then raise exception 'Completed workouts are read-only' using errcode='22023'; end if;
  elsif p_expected_version <> 0 then raise exception 'Workout not found or version changed' using errcode='40001';
  end if;
  if p_expected_version is null or p_expected_version < 0 or wid is null or p_mutation_id is null then raise exception 'Invalid save metadata' using errcode='22023'; end if;
  if p_document->>'routineId' is not null and not exists(select 1 from public.routines where id=(p_document->>'routineId')::uuid and user_id=uid) then raise exception 'Routine not found' using errcode='42501'; end if;
  if jsonb_typeof(p_document->'exercises') is distinct from 'array' or jsonb_array_length(p_document->'exercises')>50 then raise exception 'Invalid exercises' using errcode='22023'; end if;
  insert into public.workouts(id,user_id,routine_id,name,status,started_at,completed_at,version)
    values(wid,uid,(p_document->>'routineId')::uuid,p_document->>'name',p_document->>'status',(p_document->>'startedAt')::timestamptz,(p_document->>'completedAt')::timestamptz,p_expected_version+1)
  on conflict(id) do update set name=excluded.name,status=excluded.status,completed_at=excluded.completed_at,version=excluded.version,updated_at=now();
  for e in select value from jsonb_array_elements(p_document->'exercises') loop
    if jsonb_typeof(e->'sets') is distinct from 'array' or jsonb_array_length(e->'sets')>50 then raise exception 'Invalid sets' using errcode='22023'; end if;
    -- Preserve the original muscle snapshot; clients cannot manufacture historical anatomy.
    select snapshot into snap from public.session_exercises where id=(e->>'id')::uuid and workout_id=wid and exercise_id=e->>'exerciseId';
    if snap is null then select data into snap from public.exercises where id=e->>'exerciseId'; end if;
    if snap is null then raise exception 'Unknown exercise' using errcode='22023'; end if;
    -- Existing IDs belonging to other workouts must fail, never be moved by upsert.
    if exists(select 1 from public.session_exercises where id=(e->>'id')::uuid and (workout_id<>wid or exercise_id<>e->>'exerciseId')) then raise exception 'Exercise ID belongs to another record' using errcode='22023'; end if;
    insert into public.session_exercises(id,workout_id,exercise_id,position,prescription,snapshot)
      values((e->>'id')::uuid,wid,e->>'exerciseId',ep,e->'prescription',snap)
      on conflict(id) do update set position=excluded.position,prescription=excluded.prescription;
    delete from public.exercise_sets where session_exercise_id=(e->>'id')::uuid;
    sp:=0;
    for s in select value from jsonb_array_elements(e->'sets') loop
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

create function public.save_routine(p_document jsonb, p_expected_version integer, p_mutation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); rid uuid:=(p_document->>'id')::uuid; old public.routines; replay public.mutations; result jsonb; e jsonb; ep integer:=0; hash text:=md5('routine'||p_document::text||p_expected_version::text);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into replay from public.mutations where user_id=uid and id=p_mutation_id;
  if found then
    if replay.request_hash<>hash then raise exception 'Mutation was reused with a different request' using errcode='40001'; end if;
    return replay.result;
  end if;
  select * into old from public.routines where id=rid for update;
  if found then
    if old.user_id<>uid then raise exception 'Routine not found' using errcode='42501'; end if;
    if old.version<>p_expected_version then raise exception 'Routine changed on another device' using errcode='40001'; end if;
  elsif p_expected_version<>0 then raise exception 'Routine not found or version changed' using errcode='40001'; end if;
  if p_expected_version is null or p_expected_version<0 or rid is null or p_mutation_id is null then raise exception 'Invalid save metadata' using errcode='22023'; end if;
  if jsonb_typeof(p_document->'exercises') is distinct from 'array' or jsonb_array_length(p_document->'exercises') not between 1 and 50 then raise exception 'Choose 1 to 50 exercises' using errcode='22023'; end if;
  insert into public.routines(id,user_id,name,version) values(rid,uid,p_document->>'name',p_expected_version+1)
  on conflict(id) do update set name=excluded.name,version=excluded.version,updated_at=now();
  delete from public.routine_exercises where routine_id=rid;
  for e in select value from jsonb_array_elements(p_document->'exercises') loop
    insert into public.routine_exercises(id,routine_id,exercise_id,position,prescription) values((e->>'id')::uuid,rid,e->>'exerciseId',ep,e->'prescription');
    ep:=ep+1;
  end loop;
  result:=public.routine_document(rid);
  insert into public.mutations(user_id,id,request_hash,result) values(uid,p_mutation_id,hash,result);
  return result;
end $$;
create function public.delete_routine(p_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  delete from public.routines where id=p_id and user_id=auth.uid() and version=p_expected_version;
  if not found then raise exception 'Routine not found or version changed' using errcode='40001'; end if;
end $$;
revoke all on function public.save_workout(jsonb,integer,uuid), public.save_routine(jsonb,integer,uuid), public.delete_routine(uuid,integer), public.workout_document(uuid), public.routine_document(uuid), public.valid_prescription(jsonb) from public;
grant execute on function public.save_workout(jsonb,integer,uuid), public.save_routine(jsonb,integer,uuid), public.delete_routine(uuid,integer), public.workout_document(uuid), public.routine_document(uuid), public.valid_prescription(jsonb) to authenticated;
