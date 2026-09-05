import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { propostaNumero, validateProposta } from '../_lib/portabilidade';
import { escolherMotivoOperacional } from '../_lib/portabilidadeMotivo';
import {
  andamentoToutbox,
  hasIccid,
  rotuloIccidPorAndamento,
} from '../_lib/portabilidadeAndamento';

type Env = EnvAuth & RateLimitEnv & {
  PORTABILIDADE_SUPABASE_URL?: string;
  PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
};

function portabConfig(env: Env) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function normalizeProposta(raw: string): string {
  return validateProposta(raw) || '';
}

async function sbGet(
  cfg: { url: string; key: string },
  table: string,
  params: Record<string, string>,
) {
  const q = new URLSearchParams(params);
  const r = await fetch(`${cfg.url}/rest/v1/${table}?${q}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  if (!r.ok) {
    console.error(`[portabilidade-journey] ${table} HTTP ${r.status}`);
    throw new Error(`Falha ao consultar ${table}.`);
  }
  return r.json();
}

/** Journey Trace — timeline por proposta (fila + CE + retornos). */
export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-journey', 60_000, 40))) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = portabConfig(context.env);
  if (!cfg) {
    return json({ error: 'Secrets portabilidade ausentes.' }, 503);
  }

  const u = new URL(context.request.url);
  const proposta = normalizeProposta(u.searchParams.get('proposta') || '');
  if (!proposta) {
    return json({ error: 'Proposta inválida. Use formato 3F-XXXXXXXX (somente dígitos).' }, 400);
  }
  const numero = propostaNumero(proposta);
  const propFilter = `(proposta_isize.eq.${proposta},proposta_isize.eq.${numero})`;

  try {
    const [fila, ce, retornos, entrega] = await Promise.all([
      sbGet(cfg, 'fila_acoes_portabilidade', {
        or: propFilter,
        select:
          'id,acao,status,endpoint,executar_apos,executed_at,created_at,tentativas,resultado_mensagem,resultado_is_valid,order_number,origem_retorno_id',
        order: 'created_at.asc',
        limit: '80',
      }),
      sbGet(cfg, 'consultas_enviadas_pos_aceite', {
        or: propFilter,
        select:
          'proposta_isize,order_number,order_status,ticket_status,ticket_number,portability_date,iccid,tim_chip,ultimo_retorno_em,enviada_em',
        limit: '5',
      }),
      sbGet(cfg, 'retornos_reprocessamento', {
        or: `(proposta.eq.${proposta},proposta.eq.${numero},external_code.eq.${proposta})`,
        select:
          'id,proposta,external_code,order_status,ticket_status,motivo,operacao,adjustments,processed_at,created_at',
        order: 'processed_at.desc',
        limit: '40',
      }).catch(() => []),
      sbGet(cfg, 'aguardando_entrega', {
        or: propFilter,
        select:
          'id,proposta_isize,status,toutbox_status,toutbox_classificacao,acao_pendente,iccid,tentativas_toutbox,executar_apos,updated_at,created_at',
        order: 'updated_at.desc',
        limit: '10',
      }).catch(() => []),
    ]);

    type Ev = {
      ts: string;
      fonte: string;
      titulo: string;
      detalhe?: string;
      status?: string;
    };
    const eventos: Ev[] = [];

    for (const row of (ce as Array<Record<string, unknown>>) || []) {
      eventos.push({
        ts: String(row.ultimo_retorno_em || row.enviada_em || ''),
        fonte: 'ce',
        titulo: 'Consulta / CE',
        detalhe: `OS ${row.order_number || '—'} · order=${row.order_status || '—'} · ticket=${row.ticket_status || '—'} · iccid=${row.iccid || row.tim_chip ? 'sim' : 'não'}`,
        status: String(row.ticket_status || row.order_status || ''),
      });
    }

    for (const row of (fila as Array<Record<string, unknown>>) || []) {
      eventos.push({
        ts: String(row.executed_at || row.executar_apos || row.created_at || ''),
        fonte: 'fila',
        titulo: `Fila · ${row.acao}`,
        detalhe: `${row.status}${row.resultado_mensagem ? ` — ${String(row.resultado_mensagem).slice(0, 120)}` : ''}`,
        status: String(row.status || ''),
      });
    }

    for (const row of (retornos as Array<Record<string, unknown>>) || []) {
      eventos.push({
        ts: String(row.processed_at || row.created_at || ''),
        fonte: 'retorno',
        titulo: `Retorno · ${row.operacao || '—'}`,
        detalhe: `${row.order_status || ''} ${row.motivo ? `· ${String(row.motivo).slice(0, 100)}` : ''} ${row.adjustments ? `· ${String(row.adjustments).slice(0, 80)}` : ''}`.trim(),
        status: String(row.operacao || ''),
      });
    }

    for (const row of (entrega as Array<Record<string, unknown>>) || []) {
      eventos.push({
        ts: String(row.updated_at || row.created_at || ''),
        fonte: 'logistica',
        titulo: `Toutbox · ${row.status}`,
        detalhe: `${row.toutbox_classificacao || row.toutbox_status || '—'} · acao=${row.acao_pendente || '—'} · cic=${row.tentativas_toutbox ?? '—'} · iccid=${row.iccid ? 'sim' : 'não'}`,
        status: String(row.status || ''),
      });
    }

    eventos.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    const ce0 = ((ce as Array<Record<string, unknown>>) || [])[0] || null;
    const filaArr = (fila as Array<Record<string, unknown>>) || [];
    const entregaArr = (entrega as Array<Record<string, unknown>>) || [];
    const ativas = filaArr.filter((f) =>
      ['pendente', 'executando', 'bko'].includes(String(f.status || '').toLowerCase()),
    );
    const bko = ativas.filter((f) => f.status === 'bko').length;
    const pend = ativas.filter((f) => f.status === 'pendente').length;
    const ag0 = entregaArr[0] || null;
    const tem_iccid = hasIccid(
      String(ce0?.iccid || ag0?.iccid || ''),
      String(ce0?.tim_chip || ''),
    );
    const andamento = andamentoToutbox(
      ag0
        ? {
            status: ag0.status != null ? String(ag0.status) : null,
            toutbox_classificacao:
              ag0.toutbox_classificacao != null
                ? String(ag0.toutbox_classificacao)
                : ag0.toutbox_status != null
                  ? String(ag0.toutbox_status)
                  : null,
            iccid: ag0.iccid != null ? String(ag0.iccid) : null,
          }
        : null,
      tem_iccid,
    );
    const motivo_fila = escolherMotivoOperacional({
      filas: filaArr.map((f) => ({
        retorno_motivo: null,
        resultado_mensagem: f.resultado_mensagem != null ? String(f.resultado_mensagem) : null,
      })),
    });

    return json({
      ok: true,
      proposta,
      resumo: {
        order_number: ce0?.order_number || null,
        order_status: ce0?.order_status || null,
        ticket_status: ce0?.ticket_status || null,
        tem_iccid,
        iccid_label: rotuloIccidPorAndamento(tem_iccid, andamento),
        motivo_fila,
        andamento_toutbox: andamento,
        acoes_fila: ativas.length,
        pendentes: pend,
        bko,
        logistica_status: ag0?.status || null,
        toutbox: andamento || ag0?.toutbox_classificacao || ag0?.toutbox_status || null,
      },
      ce: ce0,
      fila: filaArr,
      entrega: entregaArr,
      retornos: retornos || [],
      timeline: eventos.filter((e) => e.ts),
    });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return json({ error: msg }, 502);
  }
}
