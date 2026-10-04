-- DOME OS — ÚŘAD · D2 PRE-FLIGHT AUDIT (jen čtení, nic nemění)
-- Spusťte v Supabase SQL Editoru a celý výstup pošlete zpět.

-- 1) Všechny overloady + definice urad_record_dome_assessment
select p.oid::regprocedure as signature, p.prosecdef as security_definer, p.proconfig as config,
       pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'urad_record_dome_assessment';

-- 2) Kdo smí funkce spouštět
select routine_name, specific_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name in ('urad_record_dome_assessment','urad_has_access')
order by 1, 3;

-- 3) RLS stav a policies
select relname, relrowsecurity, relforcerowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname in ('urad_cases','urad_case_steps');
select tablename, policyname, cmd, roles, permissive, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('urad_cases','urad_case_steps')
order by tablename, cmd;

-- 4) Tabulková oprávnění (cesty k přímému INSERT/UPDATE/DELETE)
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('urad_cases','urad_case_steps')
order by 1, 2, 3;

-- 5) Sloupce, defaulty, NOT NULL a CHECK omezení urad_case_steps
select column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'urad_case_steps' order by ordinal_position;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.urad_case_steps'::regclass;

-- 6) Triggery (mohou blokovat UPDATE/DELETE = immutabilita, nebo kontrolovat kind)
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid in ('public.urad_case_steps'::regclass, 'public.urad_cases'::regclass) and not tgisinternal;

-- 7) Další funkce, které zapisují dome_assessment (jiné write paths v DB)
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%dome_assessment%';

-- 8) Data: verze ve stávajících assessments (kompatibilita s DomeCaseState v1.0)
select assessment->'case_state'->>'dome_case_schema_version' as schema_version,
       count(*) as steps,
       count(*) filter (where assessment->'case_state'->'metadata'->>'version' is null) as without_version
from public.urad_case_steps where kind = 'dome_assessment' group by 1;
