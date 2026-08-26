-- ============================================================
-- Gestão de Advertências — escala pedagógica 3F
-- ============================================================

CREATE TABLE IF NOT EXISTS advertencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Colaborador (campos imutáveis do modelo oficial)
    colaborador_nome TEXT NOT NULL,
    colaborador_matricula TEXT,
    colaborador_cpf TEXT,
    colaborador_cargo TEXT,

    -- Classificação
    motivo_categoria TEXT NOT NULL,
    motivo_texto TEXT NOT NULL,
    descricao TEXT NOT NULL,
    data_ocorrido DATE NOT NULL,

    -- Escala pedagógica (índice 0..10)
    nivel_idx INTEGER NOT NULL CHECK (nivel_idx >= 0 AND nivel_idx <= 10),
    nivel_codigo TEXT NOT NULL,
    nivel_label TEXT NOT NULL,
    dias_suspensao INTEGER DEFAULT 0,

    -- Fluxo
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

CREATE INDEX IF NOT EXISTS idx_advertencias_status ON advertencias (status);
CREATE INDEX IF NOT EXISTS idx_advertencias_colaborador ON advertencias (colaborador_nome);
CREATE INDEX IF NOT EXISTS idx_advertencias_matricula ON advertencias (colaborador_matricula);
CREATE INDEX IF NOT EXISTS idx_advertencias_data ON advertencias (data_ocorrido DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_created ON advertencias (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advertencias_nivel ON advertencias (nivel_idx);

ALTER TABLE advertencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read advertencias" ON advertencias;
DROP POLICY IF EXISTS "Anyone write advertencias" ON advertencias;

-- Frontend usa anon key + auth de app; políticas abertas (paridade com demais tabelas do dash)
CREATE POLICY "Anyone read advertencias" ON advertencias FOR SELECT USING (true);
CREATE POLICY "Anyone write advertencias" ON advertencias FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION advertencias_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_advertencias_updated ON advertencias;
  CREATE TRIGGER trg_advertencias_updated
  BEFORE UPDATE ON advertencias
  FOR EACH ROW EXECUTE PROCEDURE advertencias_touch_updated_at();
