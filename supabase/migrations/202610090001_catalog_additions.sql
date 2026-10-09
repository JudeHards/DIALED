-- Add six exercises without modifying existing workouts or their muscle snapshots.
insert into public.exercises(id,data) values
('ex_machine_press', '{"id":"ex_machine_press","name":"Machine Press","primaryMuscle":"chest","secondaryMuscles":["triceps"],"equipment":"machine","movement":"compound","laterality":"bilateral"}'::jsonb),
('ex_preacher_curl_30', '{"id":"ex_preacher_curl_30","name":"30° Preacher Curl","primaryMuscle":"biceps","secondaryMuscles":[],"equipment":"dumbbell","movement":"isolation","laterality":"unilateral"}'::jsonb),
('ex_preacher_curl_60', '{"id":"ex_preacher_curl_60","name":"60° Preacher Curl","primaryMuscle":"biceps","secondaryMuscles":[],"equipment":"dumbbell","movement":"isolation","laterality":"unilateral"}'::jsonb),
('ex_jm_press_barbell', '{"id":"ex_jm_press_barbell","name":"JM Press (Barbell)","primaryMuscle":"triceps","secondaryMuscles":["chest"],"equipment":"barbell","movement":"compound","laterality":"bilateral"}'::jsonb),
('ex_cuffed_extensions', '{"id":"ex_cuffed_extensions","name":"Cuffed Extensions","primaryMuscle":"triceps","secondaryMuscles":[],"equipment":"cable","movement":"isolation","laterality":"either"}'::jsonb),
('ex_anterior_delt_raise_cable', '{"id":"ex_anterior_delt_raise_cable","name":"Anterior Delt Raise (Cable)","primaryMuscle":"anterior delt","secondaryMuscles":[],"equipment":"cable","movement":"isolation","laterality":"unilateral"}'::jsonb)
on conflict(id) do update set data=excluded.data;
