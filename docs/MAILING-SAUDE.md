# Saúde do mailing (aba Mailing)

Visão estatística da base discada no dia: tentativas por telefone, propensão, fôlego de estoque e desgaste.

## Fontes

| Objeto (bucket `eva-dash`) | Conteúdo |
|----------------------------|----------|
| `mailing/live.json` | Snapshot ao vivo do dia (BRT) |
| `mailing/historico/YYYY-MM-DD.json` | Cópia selada do dia (atualizada a cada coleta) |
| `mailing/dias.json` | Índice compacto dos últimos 30 dias |

Coletor na VM: `scripts/sync_mailing_saude.py`  
Cron: `*/10 8-21 * * *` via `vm-batch.sh sync-mailing-saude` (job crítico da lista).

Nenhum telefone sai do SQL Server — só agregados. O contrato do dashboard recusa payload com `phone_number` / `area_code`.

## API

- `GET /api/mailing-saude?live=1` — live
- `GET /api/mailing-saude?date=YYYY-MM-DD` — histórico do dia
- `GET /api/mailing-saude?indice=1` — índice multi-dia

Auth: gestão (`requireGestao`). Rate limit + `Cache-Control` adequado (live = no-store).

## Métricas (contratos)

| Conceito | Definição |
|----------|-----------|
| Tentativa | Linha do `vw_mailing_logger` nas filas de discagem (mesmo universo Discagens) |
| Alô robô | Atendimento de usuário ROBO |
| Contato | Ligação entregue a agente humano (critério Localizou) |
| Sucesso | Bit `success` em linha humana |
| Curva | P(contato na tentativa k \| sem contato antes) |
| Propensão | Beta-binomial; sucesso por 100 mil discagens |
| Fôlego | Disponíveis ÷ telefones discados hoje |
| Desgaste | 35% esgotado + 25% giro + 20% sem estoque + 20% fadiga |

## Aba no dashboard

- Rota `/mailing`, aba `mailing` (migration `038_aba_mailing.sql`)
- Filtro de campanha compartilhado com o store EVA
- Live / Histórico; no histórico só dias já selados (anteriores a hoje)
- Operação: banner de fôlego/desgaste + atalho no Pulse

## Backfill

```bash
# Na VM (um dia por vez, respeita RAM; não toca live.json):
.venv/bin/python scripts/sync_mailing_saude.py --backfill 7
# Regrava dias já existentes:
.venv/bin/python scripts/sync_mailing_saude.py --backfill 7 --force
```

## Badge no menu

O layout consulta o live a cada 3 min e mostra no item **Mailing** a quantidade de alertas de fôlego/desgaste (respeita o filtro de campanha do store EVA).

## Gate

`scripts/check-regressao.sh` cobre rota, auth, no-store, contrato sem telefone, filtros de campanha e badge de fôlego.
