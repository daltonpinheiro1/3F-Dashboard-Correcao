-- 029 — Ack + SLA do exception board RR
-- Acesso só service_role (Pages Function admin).

CREATE TABLE IF NOT EXISTS public.rr_alert_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_ref date NOT NULL,
  campanha text NOT NULL,
  alert_id text NOT NULL,
  owner_email text NOT NULL,
  owner_name text,
  acked_at timestamptz NOT NULL DEFAULT now(),
  sla_until timestamptz NOT NULL,
  UNIQUE (data_ref, campanha, alert_id)
);

CREATE INDEX IF NOT EXISTS idx_rr_alert_acks_dia
  ON public.rr_alert_acks (data_ref, campanha);

ALTER TABLE public.rr_alert_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rr_alert_acks FROM anon;
REVOKE ALL ON TABLE public.rr_alert_acks FROM authenticated;
GRANT ALL ON TABLE public.rr_alert_acks TO service_role;

NOTIFY pgrst, 'reload schema';
