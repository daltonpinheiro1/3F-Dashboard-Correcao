-- ============================================================
-- 018 — Fecha dashboard_users + remove RPCs password-based (C1/C2)
-- Projeto: ayhrwxsxqddpeukydblz
-- Pré-requisito: 013 session harden em uso (SPA usa *_by_session)
-- ============================================================

-- 1) Tabelas sensíveis: sem acesso direto anon/authenticated
ALTER TABLE public.dashboard_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read users" ON public.dashboard_users;
DROP POLICY IF EXISTS "Authenticated manage users" ON public.dashboard_users;
DROP POLICY IF EXISTS "Admins manage users" ON public.dashboard_users;
DROP POLICY IF EXISTS "Anyone read users" ON public.dashboard_users;

REVOKE ALL ON TABLE public.dashboard_users FROM anon, authenticated;
GRANT ALL ON TABLE public.dashboard_users TO service_role;
-- SECURITY DEFINER (login/verify/list by session) continua acessando como owner

ALTER TABLE public.dashboard_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_login_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.dashboard_login_attempts TO service_role;

-- 2) Drop RPCs legado com senha admin (brute-force via anon)
DROP FUNCTION IF EXISTS public.list_dashboard_users_secure(text, text);
DROP FUNCTION IF EXISTS public.toggle_user_active_secure(text, text, uuid);
DROP FUNCTION IF EXISTS public.create_dashboard_user(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public._assert_dashboard_admin(text, text);
DROP FUNCTION IF EXISTS public.verify_password(text, text);
DROP FUNCTION IF EXISTS public.list_dashboard_users();
DROP FUNCTION IF EXISTS public.toggle_user_active(uuid);

-- 3) Audit append-only (UPDATE/DELETE bloqueados)
CREATE OR REPLACE FUNCTION public.advertencias_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'advertencias_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_advertencias_audit_no_upd ON public.advertencias_audit;
CREATE TRIGGER trg_advertencias_audit_no_upd
  BEFORE UPDATE OR DELETE ON public.advertencias_audit
  FOR EACH ROW EXECUTE PROCEDURE public.advertencias_audit_immutable();

NOTIFY pgrst, 'reload schema';
