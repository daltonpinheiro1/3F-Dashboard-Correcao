-- ============================================================
-- 038 — Aba Mailing (saúde da base) para quem já vê Discagens
-- ============================================================

UPDATE public.dashboard_perfis
SET abas = abas || '["mailing"]'::jsonb
WHERE abas ? 'discagens'
  AND NOT abas ? 'mailing';
