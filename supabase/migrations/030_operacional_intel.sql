-- Inteligência operacional: coaching, eventos, RAG, triage portabilidade

CREATE TABLE IF NOT EXISTS coaching_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_email TEXT NOT NULL,
    operador_login TEXT,
    operador_nome TEXT,
    tipo TEXT NOT NULL DEFAULT 'geral'
        CHECK (tipo IN ('cpc', 'erro', 'discagem', 'portabilidade', 'geral')),
    sugestao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'feito', 'adiado', 'ignorado')),
    contexto JSONB NOT NULL DEFAULT '{}',
    resultado JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coaching_supervisor ON coaching_actions (supervisor_email, status);
CREATE INDEX IF NOT EXISTS idx_coaching_created ON coaching_actions (created_at DESC);

CREATE TABLE IF NOT EXISTS operacional_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL,
    severidade TEXT NOT NULL DEFAULT 'info'
        CHECK (severidade IN ('info', 'warning', 'critical')),
    titulo TEXT NOT NULL,
    mensagem TEXT,
    modulo TEXT,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operacional_events_created ON operacional_events (created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge_chunks USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_titulo ON knowledge_chunks (titulo);

CREATE TABLE IF NOT EXISTS portabilidade_triage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id TEXT NOT NULL,
    classificacao TEXT NOT NULL,
    confianca REAL NOT NULL DEFAULT 0,
    acao_sugerida TEXT NOT NULL,
    auto_executavel BOOLEAN NOT NULL DEFAULT false,
    executado BOOLEAN NOT NULL DEFAULT false,
    contexto JSONB NOT NULL DEFAULT '{}',
    created_by_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_triage_proposta ON portabilidade_triage_log (proposta_id, created_at DESC);

-- Seeds RAG institucional 3F (idempotente por título)
INSERT INTO knowledge_chunks (categoria, titulo, conteudo, tags)
SELECT v.categoria, v.titulo, v.conteudo, v.tags
FROM (VALUES
(
    'advertencias',
    'Suspensão vs Advertência verbal',
    'Suspensão e apuração exigem aprovação do DP antes da emissão. Advertência verbal pode ser registrada pelo gestor quando a falta é leve e há histórico documentado. Sempre descrever fato, data e testemunhas.',
    ARRAY['dp', 'disciplinar', 'suspensao']
),
(
    'atestados',
    'INSS acima de 15 dias',
    'Atestados com período superior a 15 dias corridos devem ser encaminhados ao DP com alerta INSS. Verificar CRM, CID legível e cruzamento com escala EVA.',
    ARRAY['inss', 'dp', 'atestado']
),
(
    'operacao',
    'Meta CPC padrão',
    'Meta operacional de CPC é 65% sobre tabulações elegíveis. Bit EVA ~80% é referência técnica, não meta comercial. Coaching deve focar motivos de drop e TMA.',
    ARRAY['cpc', 'eva', 'meta']
),
(
    'portabilidade',
    'P0 — fila crítica',
    'Propostas P0 são itens com SLA estourado ou bloqueio sistêmico. Priorizar reenfileiramento, contato BKO ou escalação Slack antes de nova tentativa cega.',
    ARRAY['portabilidade', 'p0', 'disparos']
),
(
    'rr',
    'Gross vs EVA vs TIM',
    'Gross = OS+ICCID no dia (Port). EVA = sucesso tabulado. TIM = Portado+FP no mês. Gap entre Gross e EVA indica problema cadastral ou tabulação.',
    ARRAY['rr', 'gross', 'eva', 'tim']
)) AS v(categoria, titulo, conteudo, tags)
WHERE NOT EXISTS (
    SELECT 1 FROM knowledge_chunks k WHERE k.titulo = v.titulo
);

ALTER TABLE coaching_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacional_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE portabilidade_triage_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE coaching_actions FROM anon, authenticated;
REVOKE ALL ON TABLE operacional_events FROM anon, authenticated;
REVOKE ALL ON TABLE knowledge_chunks FROM anon, authenticated;
REVOKE ALL ON TABLE portabilidade_triage_log FROM anon, authenticated;
