-- ============================================================
-- FIX: Views atualizadas - excluir 'referencia' da contagem de erros
-- + Novas views para dashboard inovador
-- ============================================================

-- Deletar registros sem vendedor (período de calibração antes do fix)
DELETE FROM correcao_logs WHERE vendedor IS NULL OR vendedor = '';

-- Recriar view ranking_operadores (SEM contar referencia como erro)
CREATE OR REPLACE VIEW ranking_operadores AS
SELECT
    vendedor,
    equipe,
    supervisor,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE 
        campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
    ) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE 
            campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
        )::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct,
    -- Erros por campo (SEM referencia)
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
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY vendedor, equipe, supervisor
ORDER BY taxa_erro_pct DESC;

-- Recriar view ranking_supervisores (SEM contar referencia como erro)
CREATE OR REPLACE VIEW ranking_supervisores AS
SELECT
    supervisor,
    equipe,
    COUNT(DISTINCT vendedor) AS total_vendedores,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE 
        campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
    ) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE 
            campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
        )::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct,
    ROUND(AVG(score_confianca)::NUMERIC, 2) AS score_medio,
    COUNT(*) FILTER (WHERE 'cep' = ANY(campos_alterados)) AS erros_cep,
    COUNT(*) FILTER (WHERE 'referencia' = ANY(campos_alterados)) AS erros_referencia,
    COUNT(*) FILTER (WHERE 'bairro' = ANY(campos_alterados)) AS erros_bairro
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY supervisor, equipe
ORDER BY taxa_erro_pct ASC;

-- Recriar view estratificação (SEM referencia_tratamento que infla)
CREATE OR REPLACE VIEW estratificacao_erros AS
SELECT
    unnest(tipos_erro) AS tipo_erro,
    COUNT(*) AS total,
    COUNT(DISTINCT vendedor) AS vendedores_afetados,
    COUNT(DISTINCT equipe) AS equipes_afetadas
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY unnest(tipos_erro)
ORDER BY total DESC;

-- ============================================================
-- NOVAS VIEWS: Dashboard inovador
-- ============================================================

-- View: Evolução diária (para gráfico de tendência)
CREATE OR REPLACE VIEW evolucao_diaria AS
SELECT
    DATE(created_at) AS dia,
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
WHERE created_at > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY DATE(created_at)
ORDER BY dia DESC;

-- View: Horário de pico (quando mais erros acontecem)
CREATE OR REPLACE VIEW erros_por_hora AS
SELECT
    EXTRACT(HOUR FROM created_at)::INTEGER AS hora,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE 
        campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
    ) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE 
            campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
        )::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hora;

-- View: Top vendedores "campeões" (menor taxa de erro, min 5 propostas)
CREATE OR REPLACE VIEW top_vendedores_qualidade AS
SELECT
    vendedor,
    equipe,
    supervisor,
    COUNT(*) AS total_propostas,
    COUNT(*) FILTER (WHERE 
        campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
    ) AS total_corrigidas,
    ROUND(
        COUNT(*) FILTER (WHERE 
            campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
        )::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_erro_pct
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
GROUP BY vendedor, equipe, supervisor
HAVING COUNT(*) >= 5
ORDER BY taxa_erro_pct ASC
LIMIT 10;

-- View: Reincidência (vendedores que erram o MESMO campo repetidamente)
CREATE OR REPLACE VIEW reincidencia AS
SELECT
    vendedor,
    supervisor,
    equipe,
    unnest(campos_alterados) AS campo_erro,
    COUNT(*) AS vezes_errou
FROM correcao_logs
WHERE created_at > NOW() - INTERVAL '30 days'
  AND vendedor IS NOT NULL AND vendedor != ''
  AND campos_alterados && ARRAY['cep','logradouro','bairro','cidade','uf','numero','complemento']
GROUP BY vendedor, supervisor, equipe, unnest(campos_alterados)
HAVING COUNT(*) >= 3
ORDER BY vezes_errou DESC;
