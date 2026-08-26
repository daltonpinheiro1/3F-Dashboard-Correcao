-- 016 — Guard RLS advertencias + drop RPCs legadas + índices fila
-- Projeto: ayhrwxsxqddpeukydblz

-- Reforço RLS (idempotente — seguro mesmo se 013 já rodou)
ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone read advertencias" ON public.advertencias;
DROP POLICY IF EXISTS "Anyone write advertencias" ON public.advertencias;
REVOKE ALL ON TABLE public.advertencias FROM anon;
REVOKE ALL ON TABLE public.advertencias FROM authenticated;
GRANT ALL ON TABLE public.advertencias TO service_role;

-- Backfill entrega para registros recusados/cancelados
UPDATE public.advertencias
SET entrega_status = 'aguardando_aprovacao'
WHERE status IN ('recusada', 'cancelada')
  AND entrega_status IN ('aguardando_impressao', 'impressa', 'entregue');

-- RPCs legadas sem auth (008) — remover se existirem
DROP FUNCTION IF EXISTS public.list_dashboard_users();
DROP FUNCTION IF EXISTS public.toggle_user_active(uuid);

-- Índices para filas operacionais
CREATE INDEX IF NOT EXISTS idx_advertencias_status_entrega
  ON public.advertencias (status, entrega_status);
CREATE INDEX IF NOT EXISTS idx_advertencias_notif_pendente
  ON public.advertencias (notificacao_status)
  WHERE notificacao_status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_advertencias_colab_data
  ON public.advertencias (colaborador_matricula, data_ocorrido DESC);

NOTIFY pgrst, 'reload schema';
