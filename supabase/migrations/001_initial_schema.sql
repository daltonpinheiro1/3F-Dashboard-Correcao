-- ============================================================
-- Dashboard Correção Cadastral - Schema Inicial
-- ============================================================

-- Tabela de usuários do dashboard (login admin)
CREATE TABLE IF NOT EXISTS dashboard_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'supervisor', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- Admin master (senha será trocada no primeiro acesso)
INSERT INTO dashboard_users (email, password_hash, full_name, role)
VALUES ('admin@3fcontact.com', crypt('admin3f2026', gen_salt('bf')), 'Administrador', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Tabela principal de logs de correção
CREATE TABLE IF NOT EXISTS correcao_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposta_id TEXT NOT NULL,
    vendedor TEXT,
    equipe TEXT,
    supervisor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Campos antes/depois (JSONB para flexibilidade)
    alteracoes JSONB NOT NULL DEFAULT '{}',
    
    -- Metadados da correção
    estrategia TEXT,
    score_confianca REAL DEFAULT 0,
    fluxo TEXT,  -- portabilidade | esim | linha_nova | linha_nova_iccid
    resultado TEXT DEFAULT 'sucesso',
    
    -- Campos alterados (array para queries rápidas)
    campos_alterados TEXT[] DEFAULT '{}',
    
    -- Classificação do erro (para rankings)
    tipos_erro TEXT[] DEFAULT '{}',
    
    -- Tempo de processamento
    elapsed_ms INTEGER DEFAULT 0
);

-- Índices para queries do dashboard
CREATE INDEX IF NOT EXISTS idx_correcao_logs_created_at ON correcao_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_correcao_logs_vendedor ON correcao_logs (vendedor);
CREATE INDEX IF NOT EXISTS idx_correcao_logs_equipe ON correcao_logs (equipe);
CREATE INDEX IF NOT EXISTS idx_correcao_logs_supervisor ON correcao_logs (supervisor);
CREATE INDEX IF NOT EXISTS idx_correcao_logs_tipos_erro ON correcao_logs USING GIN (tipos_erro);
CREATE INDEX IF NOT EXISTS idx_correcao_logs_campos_alterados ON correcao_logs USING GIN (campos_alterados);

-- Retenção: função para limpar logs > 60 dias (executar via cron/pg_cron)
CREATE OR REPLACE FUNCTION limpar_logs_antigos()
RETURNS INTEGER AS $$
DECLARE
    removidos INTEGER;
BEGIN
    DELETE FROM correcao_logs WHERE created_at < NOW() - INTERVAL '60 days';
    GET DIAGNOSTICS removidos = ROW_COUNT;
    RETURN removidos;
END;
$$ LANGUAGE plpgsql;

-- RLS (Row Level Security)
ALTER TABLE correcao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ler logs
CREATE POLICY "Authenticated users can read logs"
    ON correcao_logs FOR SELECT
    TO authenticated
    USING (true);

-- Política: apenas service_role pode inserir (bot)
CREATE POLICY "Service role can insert logs"
    ON correcao_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Política: admins podem gerenciar usuários
CREATE POLICY "Admins manage users"
    ON dashboard_users FOR ALL
    TO authenticated
    USING (true);

-- View materializada para ranking de operadores (atualiza a cada query)
CREATE OR REPLACE VIEW ranking_operadores AS
SELECT
    vendedor,
    equipe,
    supervisor,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE array_length(campos_alterados, 1) > 0) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE array_length(campos_alterados, 1) > 0)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct,
    -- Erros por campo
    COUNT(*) FILTER (WHERE 'cep' = ANY(campos_alterados)) AS erros_cep,
    COUNT(*) FILTER (WHERE 'logradouro' = ANY(campos_alterados)) AS erros_logradouro,
    COUNT(*) FILTER (WHERE 'bairro' = ANY(campos_alterados)) AS erros_bairro,
    COUNT(*) FILTER (WHERE 'cidade' = ANY(campos_alterados)) AS erros_cidade,
    COUNT(*) FILTER (WHERE 'uf' = ANY(campos_alterados)) AS erros_uf,
    COUNT(*) FILTER (WHERE 'numero' = ANY(campos_alterados)) AS erros_numero,
    COUNT(*) FILTER (WHERE 'complemento' = ANY(campos_alterados)) AS erros_complemento,
    COUNT(*) FILTER (WHERE 'referencia' = ANY(campos_alterados)) AS erros_referencia
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY vendedor, equipe, supervisor
ORDER BY taxa_erro_pct DESC;

-- View para ranking de supervisores (agrupado por equipe)
CREATE OR REPLACE VIEW ranking_supervisores AS
SELECT
    supervisor,
    equipe,
    COUNT(DISTINCT vendedor) AS total_vendedores,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE array_length(campos_alterados, 1) > 0) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE array_length(campos_alterados, 1) > 0)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct,
    ROUND(AVG(score_confianca)::NUMERIC, 2) AS score_medio,
    -- Top erros da equipe
    COUNT(*) FILTER (WHERE 'cep' = ANY(campos_alterados)) AS erros_cep,
    COUNT(*) FILTER (WHERE 'referencia' = ANY(campos_alterados)) AS erros_referencia,
    COUNT(*) FILTER (WHERE 'bairro' = ANY(campos_alterados)) AS erros_bairro
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY supervisor, equipe
ORDER BY taxa_erro_pct DESC;

-- View para estratificação de erros
CREATE OR REPLACE VIEW estratificacao_erros AS
SELECT
    unnest(tipos_erro) AS tipo_erro,
    COUNT(*) AS total,
    COUNT(DISTINCT vendedor) AS vendedores_afetados,
    COUNT(DISTINCT equipe) AS equipes_afetadas
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY unnest(tipos_erro)
ORDER BY total DESC;
