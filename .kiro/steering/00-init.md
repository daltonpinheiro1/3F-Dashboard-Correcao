---
inclusion: always
---

# 3F Dashboard Correção — Contexto permanente

## O que é
SPA React/Vite no Cloudflare Pages para operação 3F:
- Correção cadastral (Supabase `correcao_logs`)
- SMS eficiência (`sms_eficiencia`)
- Operação/Chamadas/Hora a hora (EVA Storage JSON `eva-dash`)

## Dualidade de dados (NÃO misturar)
1. **Supabase Postgres** → login, usuários, correção, SMS
2. **EVA Storage público** (`live.json` + `historico/YYYY-MM-DD.json`) → jornada, CPC, tabulações, nowcasting

Produtor do EVA: `3F_ISize_Bot_Processamento/scripts/sync_eva_operacao.py` (cron ~2 min).

## Abas admin-only (padrão obrigatório)
- `/hora` → HoraPage (nowcast, ofensores, insight IA)
- `/usuarios` → UsuariosPage
- Futuro `/discagens` → DiscagensPage (mesma blindagem AuthGuard `requireAdmin` + nav `adminOnly`)

## Filtros globais EVA
`useFiltroEvaStore` (`3f-filtro-eva`): live/hist, campanha TODAS|PORTABILIDADE|MIGRACAO|ACAO_BKO, datas, search.
Reusar em Operação/Chamadas/Hora/Discagens/RR — nunca inventar store paralelo.

## RR `/rr` — uma verdade por KPI
- **Gross** = OS+ICCID (`sms_eficiencia`) universo Port, dia BRT, dedupe `proposta_id`
- **EVA** = sucesso tabulado (live); TODAS comercial = Port+Mig (**exclui BKO**)
- **TIM** = Portado+FP, cohort mês (não comparar com Gross do dia)
- Relógio/calendário: `src/lib/brt.ts` (`America/Sao_Paulo`) — nunca `new Date().getHours()`
- iSize global só em recorte Port/Todas; Mig/BKO usam jornada filtrada
- 360° Port não se aplica a filtro Mig/BKO (não misturar EVA de uma campanha com Gross de outra)
- Gross/erro no RR via `GET /api/rr-360` (admin + service role); fallback anon só se a Function não existir (dev Vite)
- Briefing RR: `POST /api/rr-insight` (3 causas + 3 ações)
- War room `/rr`: slides 20s (Esc / setas / espaço pausa)

## Regras de ouro
- Realtime ≠ Histórico (contratos e queries distintos no sync)
- Portabilidade: cruzar iSize (sucesso/aprovadas/canceladas)
- Migração: `vwSales` / GRUPO_DE_STATUS_VENDA
- Motivo de ofensor: priorizar perda **por colaborador**; fallback supervisor/global deve sinalizar `motivo_source`
- Nunca expor secrets no front; OpenAI só via Pages Function (`/api/hora-insight`)
