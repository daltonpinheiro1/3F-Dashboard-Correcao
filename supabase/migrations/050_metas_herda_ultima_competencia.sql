-- ============================================================
-- 050 — Metas: mês sem linhas herda a última competência salva
-- ============================================================
-- Sem isso, na virada do mês a API devolvia campanhas vazias e o
-- front caía nos defaults do código. `competencia_origem` indica de
-- qual mês os valores vieram; o admin grava para fixar o mês atual.

CREATE OR REPLACE FUNCTION public.list_dashboard_metas_by_session(
    p_email text,
    p_nonce text,
    p_competencia text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
    comp text;
    origem text;
    origem_sup text;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF COALESCE(v->>'valid', '') <> 'true' THEN
        RAISE EXCEPTION 'session_required';
    END IF;
    comp := COALESCE(NULLIF(trim(p_competencia), ''), to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'));

    SELECT max(m.competencia) INTO origem
    FROM public.dashboard_metas m
    WHERE m.competencia <= comp;

    SELECT max(s.competencia) INTO origem_sup
    FROM public.dashboard_metas_supervisor s
    WHERE s.competencia <= comp;

    RETURN json_build_object(
      'competencia', comp,
      'competencia_origem', origem,
      'campanhas', COALESCE((
        SELECT json_agg(json_build_object(
          'campanha_op', m.campanha_op,
          'cpc_pct', m.cpc_pct,
          'vendas_mes', m.vendas_mes,
          'expediente_horas', m.expediente_horas,
          'updated_at', m.updated_at
        ) ORDER BY m.campanha_op)
        FROM public.dashboard_metas m WHERE m.competencia = origem
      ), '[]'::json),
      'supervisores', COALESCE((
        SELECT json_agg(json_build_object(
          'supervisor_name', s.supervisor_name,
          'cpc_pct', s.cpc_pct
        ) ORDER BY s.supervisor_name)
        FROM public.dashboard_metas_supervisor s WHERE s.competencia = origem_sup
      ), '[]'::json)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.list_dashboard_metas_by_session(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_dashboard_metas_by_session(text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
