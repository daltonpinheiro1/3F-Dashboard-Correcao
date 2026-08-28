---
inclusion: always
---

# Aba ADM Discagens — especificação de produto

## Objetivo
Visão dialer por produto (Portabilidade / Migração / TODAS): tentativas, localização (agente), CPC, sucesso, eficácia, por mailing, AMD — com alertas de gap.

## Funnel canônico 3F (Victor)
```
Tentativas (mailing_logger) → Localizou/agente (attendance humano) → Tabuladas → CPC → Sucesso
```
- **Tentativas** = `vw_mailing_logger` · PORT filas 1,5 · MIG PRE CONTROLE (7,10,15,17)
- **Localizou** = `vw_user_attendance_logger` humano (≠ ROBO/HML) · PORT fila 3 · MIG mesmas filas controle
- **Alo robô** (meta) = attendance ROBO filas 1,5 · `transf% = agente÷alo_robo`
- **AMD Alo** = só diagnóstico em `dial_details` — **não** é Localizou
- Eficácia: `sucesso / tentativas`

## Fonte oficial (2026-08-24+)
- Funil: `mailing_logger` + `attendance` (`fonte=mailing_logger_attendance`)
- Tabs/CPC: `vw_mailing_dial_details` humano
- Hora: `call_time` / `end_attendance` / `dial_start_time`
- Campanhas: id_queue → PORTABILIDADE | MIGRACAO

## UI
- Rota `/discagens` + AuthGuard requireAdmin
- Loc% = agente÷tentativas · Tabs/Agente% · CPC%÷tabs · Conv%÷tabs
- Filas ROBO visíveis (tentativas); BKO oculto

## Anti-padrão
- Usar Alo AMD como Localizou
- Inventar contact_rate a partir de tabuladas
- Filtrar filas ROBO do funil de tentativas
