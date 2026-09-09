-- Ações da RR compartilhadas entre operadores/TVs.
CREATE TABLE IF NOT EXISTS public.rr_actions (
  id text PRIMARY KEY,
  data_ref date NOT NULL,
  campanha text NOT NULL,
  horizonte text NOT NULL,
  titulo text NOT NULL,
  owner text NOT NULL,
  prazo date NOT NULL,
  status text NOT NULL DEFAULT 'aberta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS rr_actions_campaign_date_idx
  ON public.rr_actions (campanha, data_ref DESC);

ALTER TABLE public.rr_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rr_actions FROM anon, authenticated;
GRANT ALL ON public.rr_actions TO service_role;
