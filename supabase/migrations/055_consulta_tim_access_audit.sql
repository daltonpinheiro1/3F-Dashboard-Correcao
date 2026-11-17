-- ============================================================
-- 055 — Auditoria de acesso à Consulta TIM (rede do escritório)
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consulta_tim_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  suspicious boolean NOT NULL DEFAULT false,
  client_ip text,
  user_agent text,
  actor_email text,
  actor_user_id text,
  actor_mode text,
  http_method text,
  request_path text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_consulta_tim_access_audit_created
  ON public.consulta_tim_access_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consulta_tim_access_audit_suspicious
  ON public.consulta_tim_access_audit (suspicious, created_at DESC)
  WHERE suspicious = true;
CREATE INDEX IF NOT EXISTS idx_consulta_tim_access_audit_ip
  ON public.consulta_tim_access_audit (client_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consulta_tim_access_audit_email
  ON public.consulta_tim_access_audit (actor_email, created_at DESC);

ALTER TABLE public.consulta_tim_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consulta_tim_access_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.consulta_tim_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.consulta_tim_access_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consulta_tim_access_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_consulta_tim_access_audit_no_upd
  ON public.consulta_tim_access_audit;
CREATE TRIGGER trg_consulta_tim_access_audit_no_upd
  BEFORE UPDATE OR DELETE ON public.consulta_tim_access_audit
  FOR EACH ROW EXECUTE PROCEDURE public.consulta_tim_access_audit_immutable();
