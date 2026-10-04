-- DOME OS — ÚŘAD · D2 MIGRATION (krok 2/2): deaktivace staré 2-param RPC
-- Spustit AŽ po nasazení aplikace, která volá jen 3-param variantu, a po ověření,
-- že dotaz 7 z pre-flight auditu nenašel žádný jiný caller.
create or replace function public.urad_record_dome_assessment(p_case_id uuid, p_assessment jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'DEPRECATED_USE_EXPECTED_VERSION' using errcode = 'P0001',
    hint = 'Use urad_record_dome_assessment(uuid, jsonb, integer).';
end;
$$;
-- Pozn.: pokud stará funkce vrací jiný typ než uuid, nahraďte returns odpovídajícím typem
-- (create or replace nesmí změnit návratový typ) — viz výstup dotazu 1.
revoke all on function public.urad_record_dome_assessment(uuid, jsonb) from public, anon;
