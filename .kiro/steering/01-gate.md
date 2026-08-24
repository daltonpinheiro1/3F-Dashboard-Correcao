---
inclusion: always
---

# Gate anti-regressão — Dashboard Correção

## Antes de mudar HoraPage / Chamadas / Operacao / evaDash / sync_eva
1. `npm run typecheck`
2. `npm run build`
3. Smoke Playwright (quando browsers instalados): `npx playwright test e2e/smoke.spec.ts`
4. Validar visualmente: Motivo + Mot.% + Fonte + Impacto em Operadores ofensores

## Contratos que NÃO podem quebrar sem migração explícita
- `EvaPayload` / `EvaHoraOperador` (inclui `motivo_source`)
- `kpis_chamadas.isize_*` (total/aceitas/canceladas/cruzamento)
- Metas Zustand v3: `metaVendasMesPort/Mig`, `expedienteHorasPort/Mig`
- Auth localStorage key `3f-dashboard-auth` (role `admin`)

## Alto risco (interrogar antes)
- Alterar filtro de tabulação no sync (`id_classification_user > 0`)
- Remover fallbacks de ofensores/motivo
- Mudar classificação Portabilidade/Migração
- Auth/role sem server-side
- Deploy Pages sem typecheck+build

## Discagens (futuro)
- Bloco novo `discagens` no payload — **não** sobrescrever `kpis_chamadas`
- Denominador de dialer (`dialed`) exige query SEM exigir tabulação
- Não chamar `contact_rate` de “tabuladas” — isso é mentira analítica
