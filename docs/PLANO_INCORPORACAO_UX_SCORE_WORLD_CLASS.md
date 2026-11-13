# Plano de incorporação — UX Score world-class

Implementado no dashboard 3F + bot Score_TIM (fases A–C).

## Entregue

| Fase | Item | Onde |
|------|------|------|
| A1 | Timeline Fila → Sessão → Crivo → Desfecho; modal no `onProgress` terminal | `consultaTimTimeline.ts`, `ConsultaTimPage` |
| A2 | Explicabilidade `outcome_code` (compostos `A+B`) + CTA | `scoreTimExplain.ts` + modal |
| A3 | Airport board: `session_hot` / refreshing, Você/ETA, intervalo 3s/8s | fila na página + `/queue` |
| B1 | Debounce 400ms CPF 11 dígitos + “Aquecendo sessão…” | lookup + prefetch bot |
| B2 | Dual-track cache: Usar cache / Reconsultar (`force_live`) | UI + BFF + intake |
| C1/C2 | SSE `?stream=1` no BFF + `EventSource` com fallback poll | `score-tim.ts`, `waitScoreTimResult` |

## Fora deste ciclo

- Badge formal de frescor / política de reconsulta
- Painel SLO admin
- Outro bureau / recuperados

## Blindagem

```bash
# 3F
npm test -- --run src/lib/consultaTimTimeline.test.ts src/lib/scoreTimExplain.test.ts src/lib/scoreTimService.sse.test.ts
bash scripts/check_consulta_tim_invariants.sh

# Score_TIM
.venv/bin/pytest tests/antiregression/test_critical_contracts.py -k force_live -q
```

## Imutáveis

RSA azul only · Crivo só em consulta real · sonda renew sem `POST /queries` · horário comercial · identidade CPF/telefone.
