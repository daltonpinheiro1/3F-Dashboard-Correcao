-- 020 — Gestão de atestados médicos (protocolo, arquivamento, IA)
-- Acesso via service_role (Pages Functions), padrão advertências 016+

CREATE TABLE IF NOT EXISTS public.atestados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    protocolo TEXT NOT NULL UNIQUE,

    -- Colaborador
    colaborador_nome TEXT NOT NULL,
    colaborador_matricula TEXT,
    colaborador_cpf TEXT,
    colaborador_cargo TEXT,

    -- Classificação do atestado
    tipo TEXT NOT NULL DEFAULT 'medico'
        CHECK (tipo IN ('medico', 'odontologico', 'acompanhamento', 'declaracao', 'outro')),
    unidade_periodo TEXT NOT NULL DEFAULT 'dias'
        CHECK (unidade_periodo IN ('dias', 'horas')),
    quantidade_dias NUMERIC(6,2) DEFAULT 0 CHECK (quantidade_dias >= 0),
    quantidade_horas NUMERIC(6,2) DEFAULT 0 CHECK (quantidade_horas >= 0),
    data_inicio DATE,
    data_fim DATE,
    cid TEXT,
    medico_nome TEXT,
    crm_uf TEXT,

    -- Fluxo DP/RH
    status TEXT NOT NULL DEFAULT 'protocolado'
        CHECK (status IN ('rascunho', 'protocolado', 'em_analise', 'aprovado', 'recusado', 'arquivado')),
    observacoes TEXT,
    recusa_motivo TEXT,

    -- Arquivo (caminho relativo no bucket — Ano/Mês/Dia/nome)
    arquivo_path TEXT,
    arquivo_mime TEXT,
    arquivo_nome_original TEXT,
    arquivo_tamanho_bytes INTEGER CHECK (arquivo_tamanho_bytes IS NULL OR arquivo_tamanho_bytes >= 0),

    -- Análise IA (extração + checklist de requisitos)
    ia_analise JSONB NOT NULL DEFAULT '{}'::jsonb,
    ia_confianca NUMERIC(4,3) CHECK (ia_confianca IS NULL OR (ia_confianca >= 0 AND ia_confianca <= 1)),

    -- Atores
    criado_por_email TEXT,
    criado_por_nome TEXT,
    analisado_por_email TEXT,
    analisado_por_nome TEXT,
    analisado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_atestados_status ON public.atestados (status);
CREATE INDEX IF NOT EXISTS idx_atestados_colaborador ON public.atestados (colaborador_nome);
CREATE INDEX IF NOT EXISTS idx_atestados_matricula ON public.atestados (colaborador_matricula);
CREATE INDEX IF NOT EXISTS idx_atestados_protocolo ON public.atestados (protocolo);
CREATE INDEX IF NOT EXISTS idx_atestados_data_inicio ON public.atestados (data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_atestados_created ON public.atestados (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atestados_tipo ON public.atestados (tipo);
CREATE INDEX IF NOT EXISTS idx_atestados_colab_ano
  ON public.atestados (colaborador_matricula, data_inicio DESC);

CREATE OR REPLACE FUNCTION public.atestados_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atestados_updated ON public.atestados;
CREATE TRIGGER trg_atestados_updated
  BEFORE UPDATE ON public.atestados
  FOR EACH ROW EXECUTE PROCEDURE public.atestados_touch_updated_at();

-- Audit trail
CREATE TABLE IF NOT EXISTS public.atestados_audit (
    id BIGSERIAL PRIMARY KEY,
    atestado_id UUID NOT NULL,
    action TEXT NOT NULL,
    actor_email TEXT,
    actor_nome TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atestados_audit_atestado ON public.atestados_audit (atestado_id, created_at DESC);

ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atestados_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.atestados FROM anon;
REVOKE ALL ON TABLE public.atestados FROM authenticated;
GRANT ALL ON TABLE public.atestados TO service_role;

REVOKE ALL ON TABLE public.atestados_audit FROM anon;
REVOKE ALL ON TABLE public.atestados_audit FROM authenticated;
GRANT ALL ON TABLE public.atestados_audit TO service_role;

NOTIFY pgrst, 'reload schema';
