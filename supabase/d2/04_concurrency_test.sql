-- DOME OS — ÚŘAD · D2 TEST DVOU SOUBĚŽNÝCH TRANSAKCÍ (ručně, dvě okna SQL / psql)
-- Nahraďte <CASE_ID>, <USER_ID>; <V> = aktuální verze případu (dotaz níže).
select coalesce((assessment->'case_state'->'metadata'->>'version')::int, 0) as v
from public.urad_case_steps where case_id = '<CASE_ID>' and kind = 'dome_assessment'
order by created_at desc, id desc limit 1;

-- OKNO A:
begin;
select set_config('request.jwt.claims', json_build_object('sub','<USER_ID>','role','authenticated')::text, true);
set local role authenticated;
select public.urad_record_dome_assessment('<CASE_ID>',
  '{"hypothesis":{"status":"unverified"},"case_state":{"metadata":{"version":<V+1>}}}'::jsonb, <V>);
-- (transakci zatím NEUKONČUJTE)

-- OKNO B (stejné příkazy, stejné <V>): zablokuje se na FOR UPDATE.

-- OKNO A:
commit;
-- Očekávání: OKNO B skončí chybou CONCURRENCY_CONFLICT (P0001). V tabulce přibyl jen jeden krok.
-- Negativní testy: p_expected_version = null → EXPECTED_VERSION_REQUIRED; cizí <USER_ID> → CASE_NOT_FOUND;
-- hypothesis.status = 'verified' → HYPOTHESIS_MUST_BE_UNVERIFIED; role anon → permission denied.
-- Testovací kroky po ověření smažte jen pokud to vaše pravidla immutability dovolují; jinak použijte testovací případ.
