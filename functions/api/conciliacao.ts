import { authorizeRequest, clientIp, json, requireAlgumaAba, sbFetch, type EnvAuth } from '../_lib/auth';
import { allowRateDistributed, allowRateForUser, type RateLimitEnv } from '../_lib/rateLimit';

type EnvConciliacao = EnvAuth &
  RateLimitEnv & {
    PORTABILIDADE_SUPABASE_URL?: string;
    PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
  };

export const ABAS_CONCILIACAO = ['disparos', 'sms'] as const;

/** Agregado da interseção. Sessão + aba obrigatórias. O JSON não fica em /public. */
export const onRequestGet: PagesFunction<EnvConciliacao> = async (context) => {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'conciliacao', 60_000, 60))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireAlgumaAba(await authorizeRequest(context.request, context.env), ABAS_CONCILIACAO);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await allowRateForUser(context.env, context.request, auth, 'conciliacao-user', 60_000, 30))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  try {
    const resp = await sbFetch(
      context.env,
      '/storage/v1/object/eva-dash/portabilidade/conciliacao/atual.json',
      { headers: { Accept: 'application/json' } },
    );
    if (!resp.ok) return json({ error: 'Conciliação ainda não publicada.' }, 404);
    const bruto = await resp.json();
    const corpo: Record<string, unknown> =
      bruto && typeof bruto === 'object' && !Array.isArray(bruto)
        ? { ...(bruto as Record<string, unknown>) }
        : {};
    if (!corpo.quarentena_fonte) corpo.quarentena_fonte = 'bot_estorno';
    corpo.divida_consulta = await contarDivida(context.env);
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return json({ error: 'Falha ao ler a conciliação.' }, 502);
  }
};

const DIVIDA_PAGINA = 1000;
const DIVIDA_MAX_PAGINAS = 20;

export async function contarDivida(env: EnvConciliacao) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const propostas = new Set<string>();
    let concluidas = 0;
    let pendentes = 0;
    let falhas = 0;
    for (let pagina = 0; pagina < DIVIDA_MAX_PAGINAS; pagina += 1) {
      const destino =
        `${url}/rest/v1/fila_acoes_portabilidade` +
        '?select=proposta_isize,status' +
        '&retorno_motivo=ilike.*arquivo%20TIM%20fechou*' +
        '&order=id.asc' +
        `&offset=${pagina * DIVIDA_PAGINA}` +
        `&limit=${DIVIDA_PAGINA}`;
      const resp = await fetch(destino, { headers });
      if (!resp.ok) return null;
      const linhas = await resp.json();
      if (!Array.isArray(linhas)) return null;
      for (const linha of linhas) {
        const num = String(linha?.proposta_isize || '').trim();
        if (num) propostas.add(num);
        const status = String(linha?.status || '').trim();
        if (status === 'concluida') concluidas += 1;
        else if (status === 'pendente') pendentes += 1;
        else if (status === 'erro' || status === 'falha') falhas += 1;
      }
      if (linhas.length < DIVIDA_PAGINA) break;
    }
    return { consultas: propostas.size, concluidas, pendentes, falhas };
  } catch {
    return null;
  }
}
