/**
 * POST /api/portabilidade-enqueue
 * Enfileira ação manual na fila TIM (consult/cancel/open/activate/reschedule).
 * Aceita: proposta única | propostas[] | lote[{ proposta, acao }] (máx 25).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAtestadoWrite,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed } from '../_lib/rateLimit';
import { normalizePropostaInput, validateProposta } from '../_lib/portabilidade';
import {
  ACOES_FILA,
  BATCH_MAX,
  enqueueProposta,
  type AcaoFila,
} from '../_lib/portabilidadeEnqueue';

type Env = EnvAuth & {
  PORTABILIDADE_SUPABASE_URL?: string;
  PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
  RATE_LIMIT?: KVNamespace;
};

type WorkItem = { raw: string; acao: AcaoFila };

function portabConfig(env: Env) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function parseAcao(raw: string | undefined, fallback?: string): AcaoFila | null {
  const acao = (raw || fallback || '').toLowerCase() as AcaoFila;
  return ACOES_FILA.includes(acao) ? acao : null;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  const isBatchHint = context.request.headers.get('X-Batch-Enqueue') === '1';
  const rateKey = isBatchHint ? 'portab-enqueue-batch' : 'portab-enqueue';
  const rateLimit = isBatchHint ? 8 : 15;
  if (!(await allowRateDistributed(context.env, ip, rateKey, 60_000, rateLimit))) {
    return json({ error: 'Rate limit. Aguarde.' }, 429);
  }

  const auth = requireAtestadoWrite(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = portabConfig(context.env);
  if (!cfg) return json({ error: 'PORTABILIDADE_SUPABASE_* ausente.' }, 503);

  let body: {
    proposta?: string;
    propostas?: string[];
    lote?: Array<{ proposta?: string; acao?: string }>;
    acao?: string;
    confirmar?: boolean;
  };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  if (!body.confirmar) {
    return json({ error: 'Confirme a ação (confirmar: true).' }, 400);
  }

  const userEmail =
    auth.mode === 'session' ? auth.user?.email || 'dashboard' : 'secret';

  let work: WorkItem[] = [];

  if (Array.isArray(body.lote) && body.lote.length) {
    work = body.lote
      .filter((x) => x.proposta?.trim())
      .map((x) => {
        const acao = parseAcao(x.acao, body.acao);
        return acao ? { raw: x.proposta!.trim(), acao } : null;
      })
      .filter(Boolean) as WorkItem[];
    if (work.length !== body.lote.filter((x) => x.proposta?.trim()).length) {
      return json({ error: `Ação inválida no lote. Use: ${ACOES_FILA.join(', ')}` }, 400);
    }
  } else {
    const acao = parseAcao(body.acao);
    if (!acao) {
      return json({ error: `Ação inválida. Use: ${ACOES_FILA.join(', ')}` }, 400);
    }
    const rawList = Array.isArray(body.propostas)
      ? body.propostas
      : body.proposta
        ? [body.proposta]
        : [];
    work = rawList.map((raw) => ({ raw, acao }));
  }

  if (!work.length) {
    return json({ error: 'Informe proposta, propostas[] ou lote[].' }, 400);
  }

  if (work.length > BATCH_MAX) {
    return json({ error: `Lote máximo: ${BATCH_MAX} propostas.` }, 400);
  }

  if (work.length === 1) {
    const { raw, acao } = work[0]!;
    const proposta = validateProposta(normalizePropostaInput(raw));
    if (!proposta) {
      return json({ error: 'Proposta inválida. Use 3F-XXXXXXXX.' }, 400);
    }

    const r = await enqueueProposta({ cfg, propostaRaw: raw, acao, userEmail });
    if (!r.ok) {
      return json({ error: r.error, proposta: r.proposta }, r.status);
    }
    return json({
      ok: true,
      proposta: r.proposta,
      acao,
      fila_id: r.fila_id ?? null,
      duplicata: r.duplicata ?? false,
      mensagem: r.duplicata
        ? `Ação ${acao} já pendente para ${r.proposta}.`
        : `${acao} enfileirado para ${r.proposta}. Bot processará em breve.`,
      auditado_por: userEmail,
    });
  }

  const resultados = [];
  let enfileirados = 0;
  let duplicatas = 0;
  let erros = 0;
  const porAcao: Record<string, number> = {};

  for (const { raw, acao } of work) {
    const r = await enqueueProposta({ cfg, propostaRaw: raw, acao, userEmail });
    resultados.push(r);
    porAcao[acao] = (porAcao[acao] || 0) + 1;
    if (r.ok) {
      if (r.duplicata) duplicatas++;
      else enfileirados++;
    } else {
      erros++;
    }
  }

  const acaoResumo = Object.entries(porAcao)
    .map(([a, n]) => `${n} ${a}`)
    .join(', ');

  return json({
    ok: erros === 0 || enfileirados > 0 || duplicatas > 0,
    lote: true,
    total: work.length,
    enfileirados,
    duplicatas,
    erros,
    por_acao: porAcao,
    resultados,
    mensagem: `Lote (${acaoResumo}): ${enfileirados} enfileirado(s), ${duplicatas} duplicata(s), ${erros} erro(s).`,
    auditado_por: userEmail,
  });
}
