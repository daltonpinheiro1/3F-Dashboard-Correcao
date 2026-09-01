# Varredura final — 2026-08-31

Escopo: `3F_Dashboard_Correcao` após `c508b6e` + follow-up desta varredura.

## Bugs corrigidos nesta rodada

| Sev | Bug | Fix |
|-----|-----|-----|
| P0 | Race live↔hist em Operação / Hora / Discagens (resposta antiga sobrescreve UI) | `fetchGen` em cada página; ignora resultado stale |
| P0 | Hora refetcha D-1..D-3 a cada poll 30s | Cache por `live.data`; só busca ontem no load com spin ou troca de dia |
| P1 | Filter injection residual em listagens PostgREST (`status=eq.${input}`) | Allowlist `sanitizeAdvertenciaStatus` / `sanitizeAtestadoStatus` |
| P1 | PDF atestado: path só archive; falha se archive vazio | Fallback assina `arquivo_path` cloud |
| P1 | Botão Abrir PDF sem arquivo anexado | Só aparece se houver path/thumb/archive |
| P1 | Deep link Operação: URL sem `login` não limpava ficha | Sync bidirecional `searchParams` → `opLogin` |
| P2 | Hora erro sem `role="alert"` | Atributos a11y no banner |

## Já blindado (commit anterior)

- Anti React #185 (`pageHeader` split ctx + `mergePageMeta`)
- ErrorBoundary por rota
- PDF solicitação atestado (owner) + advertência gestão pós-aprovação
- Enqueue destrutivo só admin; Slack P0 sanitizado
- Rate limit KV copiloto/analytics

## Débito consciente (não regressão; próximo ciclo)

1. Fechar RLS anon em `correcao_logs` / `sms_*` **após** migrar Dashboard/SMS para API autenticada
2. Tornar bucket `eva-dash` privado + proxy autenticado
3. Migrar páginas EVA para `useEvaLive` (AbortController compartilhado)

## Guards / testes

- `sanitizeAdvertenciaStatus` / `sanitizeAtestadoStatus` + testes unitários
- `check-regressao.sh`: gen anti-race em Hora/Operação/Discagens; allowlist listagens
