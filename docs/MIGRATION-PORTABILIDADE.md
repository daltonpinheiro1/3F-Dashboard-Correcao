# Migrations 026/027 — Portabilidade (Disparos)

## Você tem DOIS projetos Supabase

| Projeto | Ref | URL | O que tem |
|---------|-----|-----|-----------|
| **Dashboard** (advertências) | `ayhrwxsxqddpeukydblz` | https://supabase.com/dashboard/project/ayhrwxsxqddpeukydblz | `advertencias`, `dashboard_users` |
| **Qigger / Reprocessamento** | `hatjmfkjnjbghmolveph` | https://supabase.com/dashboard/project/hatjmfkjnjbghmolveph | `consultas_enviadas_pos_aceite`, `fila_acoes_portabilidade`, `aguardando_entrega` |

**026, 027 e 028 só rodam no Qigger (`hatjmfkjnjbghmolveph`).**

Se aparecer o erro `consultas_enviadas_pos_aceite não existe` → você está no projeto **errado** (dashboard).

---

## Passo a passo

### 1. Abra o SQL Editor do projeto certo

Link direto:  
https://supabase.com/dashboard/project/hatjmfkjnjbghmolveph/sql/new

Confirme no canto superior: o nome/ref do projeto deve ser **hatjmfkjnjbghmolveph**, **não** ayhrwxsxqddpeukydblz.

### 2. Rode o diagnóstico

Cole e execute `supabase/migrations/025_portabilidade_diagnostico.sql`.

Resultado esperado:
```
diagnostico: OK — projeto Qigger/reprocessamento (pode rodar 026 e 027)
```
E 3 tabelas listadas.

Se aparecer `ERRADO — este é o Supabase do dashboard` → troque de projeto.

### 3. Rode 026 → 027 → 028

No **mesmo** projeto (hatjmfkjnjbghmolveph), nesta ordem:
1. `026_portabilidade_funil.sql` — índices + RPC base
2. `027_portabilidade_cohort_universo.sql` — RPC com universo + sucesso TIM
3. `028_portabilidade_cohort_dedup.sql` — contagens **únicas por `proposta_isize`** (Portado/Falha/Cancelada sem duplicar linhas CE)

Alternativa mínima (só RPC, sem índices):  
`026_portabilidade_rpc_apenas.sql` → depois `027` → depois `028`.

### 4. Valide

```sql
SELECT public.portabilidade_cohort_stats('2026-08');
```

Deve retornar JSON com `portados`, `universo`, `sucesso_tim`, `dedup_por_proposta: true`, etc.

---

## Cloudflare Pages

O secret `PORTABILIDADE_SUPABASE_URL` deve ser:

```
https://hatjmfkjnjbghmolveph.supabase.co
```

**Não** use a URL do dashboard (`ayhrwxsxqddpeukydblz`).

Verificar/atualizar:
```bash
npx wrangler pages secret put PORTABILIDADE_SUPABASE_URL --project-name=3f-dashboard-correcao
# cole: https://hatjmfkjnjbghmolveph.supabase.co
```

---

## Por que o erro aparece?

A migration 026 inclui um check de segurança: se `consultas_enviadas_pos_aceite` não existir, **para antes** de criar índices/RPC com mensagem clara.

Isso evita rodar SQL de portabilidade no banco de advertências por engano.
