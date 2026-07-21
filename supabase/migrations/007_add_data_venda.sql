-- Adicionar campo data_venda para filtrar por data da venda real (não do processamento)
ALTER TABLE correcao_logs ADD COLUMN IF NOT EXISTS data_venda TIMESTAMPTZ;

-- Índice para queries por data_venda
CREATE INDEX IF NOT EXISTS idx_correcao_logs_data_venda ON correcao_logs (data_venda DESC);

-- Recriar views com suporte a data_venda
CREATE OR REPLACE VIEW evolucao_diaria AS
SELECT
    DATE(COALESCE(data_venda, created_at)) AS dia,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE 
        campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
    ) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE 
            campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
        )::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct,
    ROUND(AVG(elapsed_ms)::NUMERIC / 1000, 1) AS tempo_medio_s,
    COUNT(DISTINCT vendedor) AS vendedores_ativos
FROM correcao_logs
WHERE COALESCE(data_venda, created_at) > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY DATE(COALESCE(data_venda, created_at))
ORDER BY dia DESC;
