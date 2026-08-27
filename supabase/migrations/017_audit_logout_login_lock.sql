-- ============================================================
-- 017 — Audit trail advertências + logout server-side + lockout login
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Trilha imutável de advertências (somente service_role / Functions)
CREATE TABLE IF NOT EXISTS public.advertencias_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  advertencia_id uuid,
  action text NOT NULL,
  actor_email text,
  actor_nome text,
  actor_mode text,
  before_status text,
  after_status text,
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_advertencias_audit_adv
  ON public.advertencias_audit (advertencia_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_audit_created
  ON public.advertencias_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_audit_action
  ON public.advertencias_audit (action, created_at DESC);

ALTER TABLE public.advertencias_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.advertencias_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.advertencias_audit TO service_role;

-- 2) Logout server-side: invalida nonce se bater
CREATE OR REPLACE FUNCTION public.logout_dashboard_session(p_email text, p_nonce text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_email IS NULL OR p_nonce IS NULL
     OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
    -- Resposta genérica (não enumerar)
    RETURN json_build_object('ok', true);
  END IF;

  UPDATE public.dashboard_users
  SET session_nonce = NULL,
      session_expires_at = NULL
  WHERE email = lower(trim(p_email))
    AND session_nonce IS NOT NULL
    AND session_nonce = trim(p_nonce);

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.logout_dashboard_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logout_dashboard_session(text, text) TO anon, authenticated, service_role;

-- 3) Lockout de login (anti brute-force) — persistente no Postgres
CREATE TABLE IF NOT EXISTS public.dashboard_login_attempts (
  email text PRIMARY KEY,
  fail_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_login_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.dashboard_login_attempts TO service_role;
-- RPC login_user (security definer) acessa a tabela diretamente

CREATE OR REPLACE FUNCTION public.login_user(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    user_record RECORD;
    exp_at timestamptz;
    nonce text;
    email_norm text;
    att RECORD;
    max_fails constant int := 8;
    lock_minutes constant int := 15;
BEGIN
    email_norm := lower(trim(p_email));

    -- Lockout ativo?
    SELECT fail_count, locked_until INTO att
    FROM public.dashboard_login_attempts
    WHERE email = email_norm;

    IF att.locked_until IS NOT NULL AND att.locked_until > now() THEN
        RETURN json_build_object('success', false, 'error', 'locked');
    END IF;

    -- Janela de lock expirou → zera contador para nova tentativa
    IF att.locked_until IS NOT NULL AND att.locked_until <= now() THEN
        DELETE FROM public.dashboard_login_attempts WHERE email = email_norm;
    END IF;

    SELECT id, email, full_name, role, is_active, password_hash
    INTO user_record
    FROM public.dashboard_users
    WHERE email = email_norm;

    IF user_record IS NULL THEN
        INSERT INTO public.dashboard_login_attempts (email, fail_count, locked_until, updated_at)
        VALUES (email_norm, 1, NULL, now())
        ON CONFLICT (email) DO UPDATE
          SET fail_count = public.dashboard_login_attempts.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts.fail_count + 1 >= max_fails
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE public.dashboard_login_attempts.locked_until
              END,
              updated_at = now();
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;

    IF NOT user_record.is_active THEN
        RETURN json_build_object('success', false, 'error', 'inactive');
    END IF;

    IF user_record.password_hash != extensions.crypt(p_password::text, user_record.password_hash::text) THEN
        INSERT INTO public.dashboard_login_attempts (email, fail_count, locked_until, updated_at)
        VALUES (email_norm, 1, NULL, now())
        ON CONFLICT (email) DO UPDATE
          SET fail_count = public.dashboard_login_attempts.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts.fail_count + 1 >= max_fails
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE NULL
              END,
              updated_at = now();
        RETURN json_build_object('success', false, 'error', 'invalid_password');
    END IF;

    -- Sucesso: limpa tentativas
    DELETE FROM public.dashboard_login_attempts WHERE email = email_norm;

    exp_at := now() + interval '12 hours';
    nonce := encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE public.dashboard_users
    SET last_login_at = now(),
        session_nonce = nonce,
        session_expires_at = exp_at
    WHERE id = user_record.id;

    RETURN json_build_object(
        'success', true,
        'id', user_record.id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role', user_record.role,
        'session_expires_at', exp_at,
        'session_nonce', nonce
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
