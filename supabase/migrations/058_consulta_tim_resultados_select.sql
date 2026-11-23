-- ============================================================
-- 058 — Leitura de consulta_tim_resultados para apuração (DBeaver)
-- Projeto: ayhrwxsxqddpeukydblz
-- ============================================================

GRANT SELECT ON TABLE public.consulta_tim_resultados TO authenticated, anon;
GRANT SELECT ON TABLE public.consulta_tim_resultados_diario TO authenticated, anon;

DROP POLICY IF EXISTS consulta_tim_resultados_select_authenticated
  ON public.consulta_tim_resultados;
CREATE POLICY consulta_tim_resultados_select_authenticated
  ON public.consulta_tim_resultados
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS consulta_tim_resultados_select_anon
  ON public.consulta_tim_resultados;
CREATE POLICY consulta_tim_resultados_select_anon
  ON public.consulta_tim_resultados
  FOR SELECT
  TO anon
  USING (true);
