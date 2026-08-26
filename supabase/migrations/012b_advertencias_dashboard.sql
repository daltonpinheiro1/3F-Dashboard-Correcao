-- ============================================================
-- 012b — Gestão de Advertências (projeto DASHBOARD Correção)
-- Projeto correto: ayhrwxsxqddpeukydblz (3F Dash Correções)
-- NÃO rodar no Score Qigger (hatjmfkjnjbghmolveph)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.advertencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    colaborador_nome TEXT NOT NULL,
    colaborador_matricula TEXT,
    colaborador_cpf TEXT,
    colaborador_cargo TEXT,

    motivo_categoria TEXT NOT NULL,
    motivo_texto TEXT NOT NULL,
    descricao TEXT NOT NULL,
    data_ocorrido DATE NOT NULL,

    nivel_idx INTEGER NOT NULL CHECK (nivel_idx >= 0 AND nivel_idx <= 10),
    nivel_codigo TEXT NOT NULL,
    nivel_label TEXT NOT NULL,
    dias_suspensao INTEGER DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'aprovada', 'recusada', 'executada', 'cancelada')),
    criado_por_email TEXT,
    criado_por_nome TEXT,
    aprovado_por_email TEXT,
    aprovado_por_nome TEXT,
    aprovado_em TIMESTAMPTZ,
    recusa_motivo TEXT,
    observacoes_supervisor TEXT,
    justificativa_pulo TEXT,
    ciencia_colaborador BOOLEAN DEFAULT false,
    testemunha1_nome TEXT,
    testemunha1_cpf TEXT,
    testemunha2_nome TEXT,
    testemunha2_cpf TEXT,
    anexos JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_advertencias_status ON public.advertencias (status);
CREATE INDEX IF NOT EXISTS idx_advertencias_colaborador ON public.advertencias (colaborador_nome);
CREATE INDEX IF NOT EXISTS idx_advertencias_matricula ON public.advertencias (colaborador_matricula);
CREATE INDEX IF NOT EXISTS idx_advertencias_data ON public.advertencias (data_ocorrido DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_created ON public.advertencias (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_nivel ON public.advertencias (nivel_idx);

ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read advertencias" ON public.advertencias;
DROP POLICY IF EXISTS "Anyone write advertencias" ON public.advertencias;

CREATE POLICY "Anyone read advertencias" ON public.advertencias
  FOR SELECT USING (true);
CREATE POLICY "Anyone write advertencias" ON public.advertencias
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.advertencias_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advertencias_updated ON public.advertencias;
CREATE TRIGGER trg_advertencias_updated
  BEFORE UPDATE ON public.advertencias
  FOR EACH ROW
  EXECUTE PROCEDURE public.advertencias_touch_updated_at();

-- Atualiza cache do PostgREST
NOTIFY pgrst, 'reload schema';

-- Validação rápida (deve retornar true)
SELECT to_regclass('public.advertencias') IS NOT NULL AS tabela_ok;
