/**
 * POST /api/what-if — simulador operacional.
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  type EnvAuth,
} from '../_lib/auth';
import { simulateWhatIf, type WhatIfInput } from '../_lib/operacionalIntel';

const hits = new Map<string, number[]>();

export async function onRequestPost(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request), 60_000, 30)) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: WhatIfInput;
  try {
    body = (await context.request.json()) as WhatIfInput;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  if (!body || typeof body.vendas_atuais !== 'number') {
    return json({ error: 'vendas_atuais obrigatório.' }, 400);
  }

  return json(
    simulateWhatIf({
      operadores_removidos: Number(body.operadores_removidos) || 0,
      cpc_por_operador_hora: Number(body.cpc_por_operador_hora) || 1,
      horas_restantes: Number(body.horas_restantes) || 1,
      vendas_atuais: Number(body.vendas_atuais) || 0,
      meta_dia: Number(body.meta_dia) || 0,
      fila_portabilidade: Number(body.fila_portabilidade) || 0,
      minutos_medio_resolucao: Number(body.minutos_medio_resolucao) || 30,
    }),
  );
}
