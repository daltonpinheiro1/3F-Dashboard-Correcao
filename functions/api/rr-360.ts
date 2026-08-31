/**
 * GET /api/rr-360?dataRef=YYYY-MM-DD&mes=YYYY-MM
 * Gross / erro / portados hoje — admin, service role (não usa anon no client).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbConfig,
  sbFetch,
  allowRate,
  type EnvAuth,
} from '../_lib/auth';
import {
  agregarErroDia,
  agregarSmsDia,
  dedupePorProposta,
  isPortadoConsolidado,
  listaErroDia,
  listaGrossDia,
  startOfBrtDayIso,
} from '../_lib/rrKpis';

const hits = new Map<string, number[]>();

type Env = EnvAuth;

async function paginar<T>(
  env: Env,
  pathBase: string,
  cap = 30_000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < cap) {
    const to = from + 999;
    const r = await sbFetch(env, pathBase, {
      headers: {
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`PostgREST ${r.status}: ${t.slice(0, 180)}`);
    }
    const batch = (await r.json()) as T[];
    out.push(...(Array.isArray(batch) ? batch : []));
    if (!Array.isArray(batch) || batch.length < 1000) break;
    from += 1000;
  }
  return out;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 30)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (!sbConfig(context.env)) {
    return json({ error: 'Supabase service ausente no Pages.' }, 503);
  }

  const url = new URL(context.request.url);
  const dataRef = (url.searchParams.get('dataRef') || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) {
    return json({ error: 'dataRef YYYY-MM-DD obrigatório.' }, 400);
  }

  const diaStart = `${dataRef}T00:00:00`;
  const diaEnd = `${dataRef}T23:59:59`;
  const hojeIso = startOfBrtDayIso();

  const smsQ = `/rest/v1/sms_eficiencia?select=proposta_id,classificacao,ticket_status,vendedor&data_venda=gte.${encodeURIComponent(diaStart)}&data_venda=lte.${encodeURIComponent(diaEnd)}`;
  const erroQ = `/rest/v1/correcao_logs?select=tipos_erro,proposta_id,vendedor&data_venda=gte.${encodeURIComponent(diaStart)}&data_venda=lte.${encodeURIComponent(diaEnd)}`;
  const hojeQ = `/rest/v1/sms_eficiencia?select=proposta_id,classificacao,ticket_status,retorno_atualizado_em&retorno_atualizado_em=gte.${encodeURIComponent(hojeIso)}`;

  try {
    const [smsRows, erroRows, hojeRows] = await Promise.all([
      paginar<{
        proposta_id: string | null;
        classificacao: string | null;
        ticket_status: string | null;
        vendedor: string | null;
      }>(context.env, smsQ),
      paginar<{ tipos_erro: string[] | null; proposta_id: string | null; vendedor: string | null }>(
        context.env,
        erroQ,
      ),
      paginar<{
        proposta_id: string;
        classificacao: string | null;
        ticket_status: string | null;
        retorno_atualizado_em: string | null;
      }>(context.env, hojeQ),
    ]);

    const sms = agregarSmsDia(smsRows);
    const erro = agregarErroDia(erroRows);
    const uniqHoje = dedupePorProposta(hojeRows, (a, b) =>
      String(b.retorno_atualizado_em || '') >= String(a.retorno_atualizado_em || '') ? b : a,
    );
    const portadosHoje = uniqHoje.filter(isPortadoConsolidado).length;

    return json({
      fonte: 'admin',
      dataRef,
      ...sms,
      ...erro,
      portadosHoje,
      listaGross: listaGrossDia(smsRows),
      listaErro: listaErroDia(erroRows),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}
