---
inclusion: always
---

# Aba ADM Discagens — especificação de produto

## Objetivo
Visão dialer por produto (Portabilidade / Migração / TODAS): discagens hora a hora, taxa de localização/contato, CPC, sucesso, eficácia, por mailing, AMD — com alertas de gap.

## Funnel canônico 3F
```
Dialed → Localizou (Alo/atendeu) → Tabuladas (humana) → CPC → Sucesso
```
- Localização ≠ bit `contact` do logger (quase morto).
- Definição: `time_on_attendance>0 OR LOWER(dialer_classification_name)='alo' OR contact=1`
- Eficácia: `sucesso / dialed` (pisos: Migração ~0,05%; Portabilidade ~0,3%)

## Fonte oficial (2026-08-20+)
- **Universo:** `vw_mailing_dial_details` (tentativas discador, excl. ROBO)
- **Não usar** join `mailing_logger` como funil (só ~atendimentos humanos)
- Hora: `dial_start_time` / `DATEPART(HOUR, …)`
- Tabulação humana: `user_classification_name` sem automatic/inicio chamada/logoff
- Campanhas: portabilidade|receptivo → PORTABILIDADE; controle → MIGRACAO
- `por_amd`: top `dialer_classification_name`

## UI
- Rota `/discagens` + AuthGuard requireAdmin
- Funil com barra = conversão etapa anterior; % = vs discadas
- Gráfico dual-axis (discadas × localizou/sucesso)
- Banner se fonte estimada; aviso se hist incompleto
- Insight IA — adiado v1.1

## Anti-padrão
- Reusar só tabuladas e chamar de “discagens”
- Inventar contact_rate (ex.: 55% das tabuladas)
- Threshold efficacy &lt; 2% no preditivo (falso alarme)
- Misturar “status_logado entregue” com “mailing entregue”
