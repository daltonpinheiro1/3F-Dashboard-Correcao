# Auditoria Técnica — Aba Disparos / Portabilidade

> Atualizado: 2026-08-29 · Implementação completa do backlog

## Status dos itens

| ID | Item | Status |
|----|------|--------|
| D-06 | Métricas documentadas (`definicao_metrica`) | ✅ |
| D-07 | Rate limit KV + `requirePortabilidadeRead` | ✅ (KV opcional via binding `RATE_LIMIT`) |
| D-08 | `totais_mes` vs `totais_ao_vivo` | ✅ |
| D-09 | Refatoração componentes | ✅ `GerencialAnalytics`, `DisparosWidgets`, types, format |
| D-10 | E2E `/disparos` | ✅ `e2e/disparos-smoke.spec.ts` |
| P1 | RPC `portabilidade_cohort_stats` | ✅ migration `026_portabilidade_funil.sql` |
| P3 | Assistente IA por fatia | ✅ `POST /api/portabilidade-fatia-insight` |

## Aplicar no Supabase portabilidade

**Projeto correto:** Qigger / reprocessamento — ref `hatjmfkjnjbghmolveph`  
(URL típica: `https://hatjmfkjnjbghmolveph.supabase.co` — mesma do secret `PORTABILIDADE_SUPABASE_URL`)

**NÃO aplicar** no Supabase do dashboard — ref `ayhrwxsxqddpeukydblz` (advertencias, usuários).  
Lá não existem `consultas_enviadas_pos_aceite`, `fila_acoes_portabilidade`, etc.

### Passo a passo

1. Abra o SQL Editor do projeto **hatjmfkjnjbghmolveph**
2. Rode primeiro o diagnóstico:
   ```sql
   -- supabase/migrations/025_portabilidade_diagnostico.sql
   ```
   Deve listar as 3 tabelas de portabilidade e dizer `OK`.
3. Rode **026**, depois **027**:
   ```bash
   # ou cole o conteúdo no SQL Editor
   supabase/migrations/026_portabilidade_funil.sql
   supabase/migrations/027_portabilidade_cohort_universo.sql
   ```
4. Valide:
   ```sql
   SELECT public.portabilidade_cohort_stats('2026-08');
   ```
   Deve retornar JSON com `universo`, `sucesso_tim`, `fonte` implícita via dashboard.

## Cloudflare KV (opcional)

Vincule namespace `RATE_LIMIT` ao projeto Pages para rate limit distribuído entre isolates.

## Definições de métrica

- **Funil gerencial**: cohort do mês (`enviada_em` ou `ultimo_retorno_em`).
- **Funil operacional**: livro aberto + fechamentos do mês.
- **Histórico**: `portados/fechados` (RPC ou fallback count).
- **Disparos totais_mes**: fila no período BRT; **totais_ao_vivo**: snapshot global.

## Arquivos principais

- `src/pages/DisparosPage.tsx`
- `src/components/disparos/GerencialAnalytics.tsx`
- `src/components/disparos/DisparosWidgets.tsx`
- `src/types/portabilidade.ts`
- `src/lib/disparosFormat.ts`
- `functions/api/portabilidade-*.ts`
- `functions/_lib/portabilidade.ts`, `rateLimit.ts`
