-- DOME OS — ÚŘAD · D2 MIGRATION (krok 1/2): atomická 3-param RPC
-- Spustit AŽ po kontrole výstupu 01_preflight_audit.sql. Stará 2-param funkce zůstává beze změny.
begin;

create or replace function public.urad_record_dome_assessment(
  p_case_id uuid,
  p_assessment jsonb,
  p_expected_version integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_current integer;
  v_new integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'EXPECTED_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if not public.urad_has_access() then
    raise exception 'ACCESS_DENIED' using errcode = '42501';
  end if;

  -- Jediný lock point: vlastní řádek případu. Souběžné zápisy do téhož případu se serializují.
  select c.user_id into v_owner from public.urad_cases c where c.id = p_case_id for update;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'CASE_NOT_FOUND' using errcode = '42501';
  end if;

  if coalesce(p_assessment->'hypothesis'->>'status', '') <> 'unverified' then
    raise exception 'HYPOTHESIS_MUST_BE_UNVERIFIED' using errcode = '22023';
  end if;

  -- Aktuální verze = verze posledního assessmentu (bez case_state / legacy = 0).
  select coalesce((s.assessment->'case_state'->'metadata'->>'version')::integer, 0) into v_current
  from public.urad_case_steps s
  where s.case_id = p_case_id and s.kind = 'dome_assessment'
  order by s.created_at desc, s.id desc
  limit 1;
  v_current := coalesce(v_current, 0);

  if v_current <> p_expected_version then
    raise exception 'CONCURRENCY_CONFLICT' using errcode = 'P0001',
      detail = format('expected %s, current %s', p_expected_version, v_current);
  end if;

  v_new := (p_assessment->'case_state'->'metadata'->>'version')::integer;
  if v_new is distinct from p_expected_version + 1 then
    raise exception 'INVALID_NEW_VERSION' using errcode = '22023',
      detail = format('expected new version %s, got %s', p_expected_version + 1, v_new);
  end if;

  -- Immutable chronologie: pouze INSERT nového kroku.
  insert into public.urad_case_steps (case_id, user_id, kind, assessment)
  values (p_case_id, v_uid, 'dome_assessment', p_assessment)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.urad_record_dome_assessment(uuid, jsonb, integer) from public, anon;
grant execute on function public.urad_record_dome_assessment(uuid, jsonb, integer) to authenticated;

commit;
