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
- RR: `matchCampanhaComercial` (TODAS = Port+Mig); BRT via `brt.ts`; Gross ≠ TIM mês

## Alto risco (interrogar antes)
- Alterar filtro de tabulação no sync (`id_classification_user > 0`)
- Remover fallbacks de ofensores/motivo
- Mudar classificação Portabilidade/Migração
- Auth/role sem server-side
- Deploy Pages sem typecheck+build

## Discagens
- Bloco `discagens` no payload — **não** sobrescrever `kpis_chamadas`
- Denominador de dialer (`dialed`) exige query SEM exigir tabulação
- Não chamar `contact_rate` de “tabuladas” — isso é mentira analítica
- Pulse/KPIs: CPC nativo do dialer **não** pode substituir o CPC EVA (`por_supervisor` / `por_operador`). Overlay `applyCpcTabulacaoHumana` / `overlayCpcTabulacaoHumana`. Taxa = CPC÷`kpis.tabuladas`. Chamadas/Operação continuam `kpisVolumeChamadas` / `cpcOperacional`.
- Overlay de campanha só com hora=todas (não misturar CPC do dia com fatia horária)
- Loc% = agente÷tentativas; AMD = `amdMixShare` (nunca vs `kpis.dialed`)

## Atestados (importação mobile + dual-write)
- Câmera Pixel/Android: `image/*` + `capture=environment`; HEIC/AVIF via `createImageBitmap` → JPEG
- Tipo do arquivo: `sniffAtestadoMagic` + `resolveAtestadoKind` (magic vence extensão)
- Portal `/atestados-solicitar` usa o mesmo `ProtocolarPanel` / `CapturaGuiada`
- Qualidade da foto é aviso, não bloqueio com “Imagem inválida”
- Arquivo completo **sempre** nuvem (`arquivo_cloud_archive_path`) **e** pasta de rede (bridge no POST + `smb:sync`). Sync **não** apaga a nuvem.
