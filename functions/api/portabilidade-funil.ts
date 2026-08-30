/**
 * Funil operacional ponta a ponta — reconciliação exclusiva por proposta.
 *
 * Universo = CE com OS ativa + logística + fila em voo + fechados no dia BRT.
 * Cada proposta cai em exatamente 1 fatia (prioridade). Soma(fatias) = universo.
 *
 * GET /api/portabilidade-funil
 * GET /api/portabilidade-funil?fatia=<id>&limit=80&offset=0
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { resolveMetaPortados } from '../_lib/portabilidadeMeta';

/** Cache curto por isolate CF — evita rebuild completo em paginação/export da mesma cohort. */
const CACHE_TTL_MS = 90_000;
const universoCache = new Map<string, { exp: number; data: unknown }>();

type Env = EnvAuth &
  RateLimitEnv & {
  PORTABILIDADE_SUPABASE_URL?: string;
  PORTABILIDADE_SUPABASE_SERVICE_KEY?: string;
  PORTABILIDADE_META_JSON?: string;
  PORTABILIDADE_META_PORTADOS_PCT?: string;
  PORTABILIDADE_META_SUCESSO_TIM?: string;
};

export type FatiaId =
  | 'sucesso_portado'
  | 'terminal_falha_parcial'
  | 'terminal_cancelada'
  | 'quebra_logistica'
  | 'bko'
  | 'em_transito'
  | 'entregue_aguardando_chip'
  | 'entregue_com_chip'
  | 'fila_activate'
  | 'fila_reschedule'
  | 'fila_cancel'
  | 'fila_open'
  | 'fila_consult'
  | 'ticket_conflito'
  | 'ticket_pendente'
  | 'ticket_suspensa'
  | 'ticket_cancelamento_pendente'
  | 'order_erro_aprov'
  | 'order_em_aprov'
  | 'aguardando_ticket'
  | 'pre_os'
  | 'orfao';

const FATIA_META: Record<
  FatiaId,
  { label: string; grupo: string; cor: string; descricao: string }
> = {
  sucesso_portado: {
    label: 'Sucesso · Portado',
    grupo: 'fechamento',
    cor: 'emerald',
    descricao: 'ticket_status = Portado (conta fechada)',
  },
  terminal_falha_parcial: {
    label: 'Terminal · Falha Parcial',
    grupo: 'fechamento',
    cor: 'rose',
    descricao: 'Ticket Falha Parcial — fim de ciclo',
  },
  terminal_cancelada: {
    label: 'Terminal · Cancelada',
    grupo: 'fechamento',
    cor: 'slate',
    descricao: 'Portabilidade Cancelada sem fila aberta',
  },
  quebra_logistica: {
    label: 'Quebra logística',
    grupo: 'logistica',
    cor: 'red',
    descricao: 'Toutbox cancelada/expirada sem ICCID — dead-end',
  },
  bko: {
    label: 'BKO / intervenção',
    grupo: 'fila',
    cor: 'amber',
    descricao: 'Fila em status bko',
  },
  em_transito: {
    label: 'Em trânsito',
    grupo: 'logistica',
    cor: 'sky',
    descricao: 'Monitorando Toutbox — ainda não entregue',
  },
  entregue_aguardando_chip: {
    label: 'Entregue · sem ICCID',
    grupo: 'logistica',
    cor: 'cyan',
    descricao: 'Entrega confirmada; chip ainda não na CE/iSize',
  },
  entregue_com_chip: {
    label: 'Entregue · com ICCID',
    grupo: 'logistica',
    cor: 'teal',
    descricao: 'Entregue e chip associado — activate deve seguir',
  },
  fila_activate: {
    label: 'Fila · activate',
    grupo: 'fila',
    cor: 'violet',
    descricao: 'activate pendente/executando (pós-chip ou pós-entrega)',
  },
  fila_reschedule: {
    label: 'Fila · reschedule',
    grupo: 'fila',
    cor: 'indigo',
    descricao: 'reschedule pendente/executando',
  },
  fila_cancel: {
    label: 'Fila · cancel',
    grupo: 'fila',
    cor: 'orange',
    descricao: 'cancel pendente/executando',
  },
  fila_open: {
    label: 'Fila · open',
    grupo: 'fila',
    cor: 'orange',
    descricao: 'open pendente/executando',
  },
  fila_consult: {
    label: 'Fila · consult',
    grupo: 'fila',
    cor: 'blue',
    descricao: 'consult pendente/executando',
  },
  ticket_conflito: {
    label: 'Ticket · Conflito',
    grupo: 'ticket',
    cor: 'amber',
    descricao: 'Conflito — matrix decide reschedule/cancel',
  },
  ticket_pendente: {
    label: 'Ticket · Port. Pendente',
    grupo: 'ticket',
    cor: 'amber',
    descricao: 'Portabilidade Pendente',
  },
  ticket_suspensa: {
    label: 'Ticket · Suspensa',
    grupo: 'ticket',
    cor: 'yellow',
    descricao: 'Portabilidade Suspensa',
  },
  ticket_cancelamento_pendente: {
    label: 'Ticket · Canc. Pendente',
    grupo: 'ticket',
    cor: 'yellow',
    descricao: 'Cancelamento Pendente · reconsulta',
  },
  order_erro_aprov: {
    label: 'Ordem · Erro Aprov',
    grupo: 'ordem',
    cor: 'red',
    descricao: 'Erro no Aprovisionamento',
  },
  order_em_aprov: {
    label: 'Ordem · Em Aprov',
    grupo: 'ordem',
    cor: 'sky',
    descricao: 'Em Aprovisionamento',
  },
  aguardando_ticket: {
    label: 'Aguardando ticket',
    grupo: 'portabilidade',
    cor: 'slate',
    descricao: 'OS 1-* sem ticket_status',
  },
  pre_os: {
    label: 'Pré-OS / aguarda consulta',
    grupo: 'portabilidade',
    cor: 'slate',
    descricao: 'CE sem OS ou status pré-consult',
  },
  orfao: {
    label: 'Órfão (investigar)',
    grupo: 'reconciliacao',
    cor: 'red',
    descricao: 'No universo mas sem classificação — gap',
  },
};

type CeRow = {
  proposta_isize?: string;
  order_number?: string | null;
  order_status?: string | null;
  ticket_status?: string | null;
  ticket_number?: string | null;
  iccid?: string | null;
  tim_chip?: string | null;
  status?: string | null;
  ultimo_retorno_em?: string | null;
  enviada_em?: string | null;
};

type AgRow = {
  proposta_isize?: string;
  status?: string | null;
  toutbox_classificacao?: string | null;
  acao_pendente?: string | null;
  iccid?: string | null;
  tentativas_toutbox?: number | null;
  updated_at?: string | null;
};

type FilaRow = {
  proposta_isize?: string;
  acao?: string | null;
  status?: string | null;
  resultado_mensagem?: string | null;
  retorno_motivo?: string | null;
  retorno_status_ordem?: string | null;
  executar_apos?: string | null;
  updated_at?: string | null;
};

type Item = {
  proposta: string;
  fatia: FatiaId;
  order_number?: string | null;
  order_status?: string | null;
  ticket_status?: string | null;
  ticket_number?: string | null;
  tem_iccid: boolean;
  logistica?: string | null;
  fila?: string | null;
  motivo_recusar?: string | null;
  cancelamento?: string | null;
  updated_at?: string | null;
};

function sortStrat(m: Record<string, number>) {
  return Object.entries(m)
    .map(([k, v]) => ({ label: k, count: v }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 30);
}

function cancelamentoLabel(ce?: CeRow, ticket?: string | null): string {
  const t = (ticket || ce?.ticket_status || '').trim();
  const tl = t.toLowerCase();
  if (!t) return '';
  if (tl.includes('cancel')) {
    const tn = (ce?.ticket_number || '').trim();
    return tn ? `${t} · #${tn}` : t;
  }
  return '';
}

function portabConfig(env: Env) {
  const url = (env.PORTABILIDADE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.PORTABILIDADE_SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function inicioDiaBrt(agora = new Date()): string {
  const spMs = agora.getTime() - 3 * 3600_000;
  const sp = new Date(spMs);
  return new Date(
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0),
  ).toISOString();
}

/** Mês BRT YYYY-MM → [start, end) em ISO UTC (00:00 BRT = 03:00 UTC). */
function mesBoundsBrt(ym: string): { start: string; end: string; label: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1, 3, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, mo, 1, 3, 0, 0)).toISOString();
  return { start, end, label: `${y}-${String(mo).padStart(2, '0')}` };
}

function mesAtualBrt(agora = new Date()): string {
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inRange(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  return iso >= start && iso < end;
}

function normProp(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const digits = s.replace(/^3F-/i, '');
  if (/^\d+$/.test(digits)) return `3F-${digits}`;
  return s.startsWith('3F-') ? s : `3F-${s}`;
}

function normTicket(t: string | null | undefined): string {
  return (t || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function normOrder(o: string | null | undefined): string {
  return (o || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function hasIccid(iccid?: string | null, tim?: string | null): boolean {
  const c = String(iccid || tim || '').replace(/\D/g, '');
  return c.length >= 19;
}

async function sbGet(
  cfg: { url: string; key: string },
  table: string,
  params: Record<string, string>,
): Promise<unknown[]> {
  const q = new URLSearchParams(params);
  const r = await fetch(`${cfg.url}/rest/v1/${table}?${q}`, {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  if (!r.ok) {
    console.error(`[portabilidade-funil] ${table} HTTP ${r.status}`);
    throw new Error(`Falha ao consultar ${table}.`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function sbPage(
  cfg: { url: string; key: string },
  table: string,
  params: Record<string, string>,
  pageSize = 1000,
  maxPages = 8,
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const all: unknown[] = [];
  for (let page = 0; page < maxPages; page++) {
    const rows = await sbGet(cfg, table, {
      ...params,
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    all.push(...rows);
    if (rows.length < pageSize) return { rows: all, truncated: false };
  }
  return { rows: all, truncated: true };
}

function classificar(opts: {
  ce?: CeRow;
  ag?: AgRow;
  filas: FilaRow[];
}): FatiaId {
  const ticket = normTicket(opts.ce?.ticket_status);
  const order = normOrder(opts.ce?.order_status);
  const ceStatus = (opts.ce?.status || '').toLowerCase();
  const agSt = (opts.ag?.status || '').toLowerCase();
  const tout = (opts.ag?.toutbox_classificacao || '').toLowerCase();
  const filas = opts.filas || [];
  const emVoo = filas.filter((f) =>
    ['pendente', 'executando'].includes(String(f.status || '').toLowerCase()),
  );
  const emBko = filas.some((f) => String(f.status || '').toLowerCase() === 'bko');

  if (ticket === 'portado') return 'sucesso_portado';
  if (ticket === 'falha parcial') return 'terminal_falha_parcial';
  if (ticket === 'portabilidade cancelada' && emVoo.length === 0 && !emBko) {
    return 'terminal_cancelada';
  }

  if (agSt === 'quebra_logistica') return 'quebra_logistica';
  if (emBko) return 'bko';

  if (agSt === 'monitorando') {
    if (tout === 'cancelada') return 'quebra_logistica';
    if (tout === 'entregue') {
      if (hasIccid(opts.ag?.iccid, opts.ce?.iccid || opts.ce?.tim_chip)) {
        return 'entregue_com_chip';
      }
      return 'entregue_aguardando_chip';
    }
    // em_transito | sem_dados | outros → ainda em andamento
    return 'em_transito';
  }

  const acaoVoo = (a: string) =>
    emVoo.some((f) => String(f.acao || '').toLowerCase() === a);
  if (acaoVoo('activate') || agSt === 'acao_enviada') return 'fila_activate';
  if (acaoVoo('reschedule')) return 'fila_reschedule';
  if (acaoVoo('cancel')) return 'fila_cancel';
  if (acaoVoo('open')) return 'fila_open';
  if (acaoVoo('consult')) return 'fila_consult';

  if (ticket === 'conflito') return 'ticket_conflito';
  if (ticket === 'portabilidade pendente') return 'ticket_pendente';
  if (ticket === 'portabilidade suspensa') return 'ticket_suspensa';
  if (ticket === 'cancelamento pendente') return 'ticket_cancelamento_pendente';

  if (order.includes('erro') && order.includes('aprov')) return 'order_erro_aprov';
  if (order.includes('em aprov') || order.includes('aprovisionamento')) {
    return 'order_em_aprov';
  }

  const os = String(opts.ce?.order_number || '');
  if (os.startsWith('1-') && !ticket) return 'aguardando_ticket';

  if (
    !os ||
    ['aguardando_os', 'aguardando_consulta'].includes(ceStatus) ||
    ceStatus === 'enviada' && !os.startsWith('1-')
  ) {
    if (!os.startsWith('1-')) return 'pre_os';
  }

  if (os.startsWith('1-') && !ticket) return 'aguardando_ticket';

  return 'orfao';
}

async function montarUniverso(
  cfg: { url: string; key: string },
  opts: { mes: string; modo: 'operacional' | 'gerencial' },
) {
  const bounds = mesBoundsBrt(opts.mes) || mesBoundsBrt(mesAtualBrt())!;
  const { start, end, label: mesLabel } = bounds;
  const hoje = inicioDiaBrt();
  const gerencial = opts.modo === 'gerencial';

  const ceSelect =
    'proposta_isize,order_number,order_status,ticket_status,ticket_number,iccid,tim_chip,status,ultimo_retorno_em,enviada_em';

  const periodoOr = `(and(enviada_em.gte.${start},enviada_em.lt.${end}),and(ultimo_retorno_em.gte.${start},ultimo_retorno_em.lt.${end}))`;
  const terminaisAbertos =
    '(ticket_status.is.null,ticket_status.eq.,and(ticket_status.neq.Portado,ticket_status.neq.Falha Parcial,ticket_status.neq.Portabilidade Cancelada))';

  const truncations: string[] = [];

  async function loadPage(
    label: string,
    table: string,
    params: Record<string, string>,
    pageSize = 1000,
    maxPages = 8,
  ): Promise<unknown[]> {
    try {
      const { rows, truncated } = await sbPage(cfg, table, params, pageSize, maxPages);
      if (truncated) truncations.push(label);
      return rows;
    } catch {
      truncations.push(`${label}:erro`);
      return [];
    }
  }

  const [cePeriodo, cePortadosMes, ceFalhaMes, ceCanceladasMes, ceAbertas, agRows, filaVoo, filaMotivos] =
    await Promise.all([
      loadPage(
        'ce_periodo',
        'consultas_enviadas_pos_aceite',
        {
          select: ceSelect,
          or: periodoOr,
          order: 'ultimo_retorno_em.desc.nullslast',
        },
        1000,
        gerencial ? 10 : 5,
      ),
      loadPage(
        'ce_portados',
        'consultas_enviadas_pos_aceite',
        {
          select: ceSelect,
          ticket_status: 'eq.Portado',
          and: `(ultimo_retorno_em.gte.${start},ultimo_retorno_em.lt.${end})`,
          order: 'ultimo_retorno_em.desc.nullslast',
        },
        1000,
        3,
      ).catch(() =>
        loadPage(
          'ce_portados_fb',
          'consultas_enviadas_pos_aceite',
          {
            select: ceSelect,
            ticket_status: 'eq.Portado',
            ultimo_retorno_em: `gte.${start}`,
            order: 'ultimo_retorno_em.desc.nullslast',
          },
          1000,
          3,
        ).then((rows) =>
          (rows as CeRow[]).filter((r) => inRange(r.ultimo_retorno_em, start, end)),
        ),
      ),
      loadPage(
        'ce_falha',
        'consultas_enviadas_pos_aceite',
        {
          select: ceSelect,
          ticket_status: 'eq.Falha Parcial',
          and: `(ultimo_retorno_em.gte.${start},ultimo_retorno_em.lt.${end})`,
          order: 'ultimo_retorno_em.desc.nullslast',
        },
        1000,
        2,
      ),
      loadPage(
        'ce_canceladas',
        'consultas_enviadas_pos_aceite',
        {
          select: ceSelect,
          ticket_status: 'eq.Portabilidade Cancelada',
          and: `(ultimo_retorno_em.gte.${start},ultimo_retorno_em.lt.${end})`,
          order: 'ultimo_retorno_em.desc.nullslast',
        },
        1000,
        3,
      ),
      gerencial
        ? Promise.resolve([])
        : loadPage(
            'ce_abertas',
            'consultas_enviadas_pos_aceite',
            {
              select: ceSelect,
              order_number: 'like.1-*',
              or: terminaisAbertos,
              order: 'ultimo_retorno_em.desc.nullslast',
            },
            1000,
            8,
          ).catch(() =>
            loadPage(
              'ce_abertas_fb',
              'consultas_enviadas_pos_aceite',
              {
                select: ceSelect,
                order_number: 'like.1-*',
                order: 'enviada_em.desc.nullslast',
              },
              1000,
              8,
            ),
          ),
      loadPage(
        'aguardando_entrega',
        'aguardando_entrega',
        {
          select:
            'proposta_isize,status,toutbox_classificacao,acao_pendente,iccid,tentativas_toutbox,updated_at',
          status: 'in.(monitorando,acao_enviada,quebra_logistica)',
          order: 'updated_at.desc',
        },
        1000,
        4,
      ),
      loadPage(
        'fila_voo',
        'fila_acoes_portabilidade',
        {
          select:
            'proposta_isize,acao,status,resultado_mensagem,executar_apos,updated_at,retorno_motivo,retorno_status_ordem',
          status: 'in.(pendente,executando,bko)',
          order: 'updated_at.desc',
        },
        1000,
        8,
      ),
      loadPage(
        'fila_motivos',
        'fila_acoes_portabilidade',
        {
          select:
            'proposta_isize,retorno_motivo,resultado_mensagem,retorno_status_ordem,updated_at,acao,status',
          retorno_motivo: 'not.is.null',
          order: 'updated_at.desc',
        },
        1000,
        6,
      ),
    ]);

  const ceMap = new Map<string, CeRow>();
  const TERMINAL = new Set(['portado', 'falha parcial', 'portabilidade cancelada']);

  const putCe = (raw: CeRow, requireMesActivity: boolean) => {
    const k = normProp(raw.proposta_isize);
    if (!k) return;
    if (requireMesActivity) {
      if (
        !inRange(raw.enviada_em, start, end) &&
        !inRange(raw.ultimo_retorno_em, start, end)
      ) {
        return;
      }
    }
    const prev = ceMap.get(k);
    if (!prev) {
      ceMap.set(k, raw);
      return;
    }
    // Preferir Portado / ticket mais recente
    const tNew = normTicket(raw.ticket_status);
    const tOld = normTicket(prev.ticket_status);
    if (tNew === 'portado' || (tNew && !tOld)) ceMap.set(k, raw);
    else if (
      (raw.ultimo_retorno_em || '') > (prev.ultimo_retorno_em || '')
    ) {
      ceMap.set(k, raw);
    }
  };

  if (gerencial) {
    for (const raw of cePeriodo as CeRow[]) putCe(raw, true);
    for (const raw of cePortadosMes as CeRow[]) putCe(raw, false);
    for (const raw of ceFalhaMes as CeRow[]) putCe(raw, false);
    for (const raw of ceCanceladasMes as CeRow[]) putCe(raw, false);
  } else {
    for (const raw of ceAbertas as CeRow[]) {
      const t = normTicket(raw.ticket_status);
      if (TERMINAL.has(t)) continue;
      putCe(raw, false);
    }
    for (const raw of cePortadosMes as CeRow[]) putCe(raw, false);
    for (const raw of ceFalhaMes as CeRow[]) putCe(raw, false);
    for (const raw of ceCanceladasMes as CeRow[]) putCe(raw, false);
    for (const raw of cePeriodo as CeRow[]) {
      const t = normTicket(raw.ticket_status);
      if (TERMINAL.has(t)) putCe(raw, true);
    }
  }

  const agMap = new Map<string, AgRow>();
  for (const raw of agRows as AgRow[]) {
    const k = normProp(raw.proposta_isize);
    if (k) agMap.set(k, raw);
  }

  const filaMap = new Map<string, FilaRow[]>();
  for (const raw of filaVoo as FilaRow[]) {
    const k = normProp(raw.proposta_isize);
    if (!k) continue;
    const arr = filaMap.get(k) || [];
    arr.push(raw);
    filaMap.set(k, arr);
  }

  const motivoMap = new Map<string, { motivo: string; msg: string }>();
  for (const raw of filaMotivos as FilaRow[]) {
    const k = normProp(raw.proposta_isize);
    if (!k || motivoMap.has(k)) continue;
    const motivo = String(raw.retorno_motivo || '').trim();
    const msg = String(raw.resultado_mensagem || '').trim();
    if (motivo || msg) motivoMap.set(k, { motivo, msg });
  }

  const keys = new Set<string>(
    gerencial
      ? [...ceMap.keys()]
      : [...ceMap.keys(), ...agMap.keys(), ...filaMap.keys()],
  );

  const items: Item[] = [];
  const counts: Record<FatiaId, number> = {} as Record<FatiaId, number>;
  for (const id of Object.keys(FATIA_META) as FatiaId[]) counts[id] = 0;

  const ticketStrat: Record<string, number> = {};
  const orderStrat: Record<string, number> = {};
  const logisticaStrat: Record<string, number> = {};
  const motivoStrat: Record<string, number> = {};
  const cancelStrat: Record<string, number> = {};

  for (const k of keys) {
    const ce = ceMap.get(k);
    const ag = agMap.get(k);
    const filas = filaMap.get(k) || [];
    const fatia = classificar({ ce, ag, filas });
    counts[fatia] += 1;

    const ticketLabel = (ce?.ticket_status || '').trim() || '(vazio)';
    ticketStrat[ticketLabel] = (ticketStrat[ticketLabel] || 0) + 1;
    const orderLabel = (ce?.order_status || '').trim() || '(vazio)';
    orderStrat[orderLabel] = (orderStrat[orderLabel] || 0) + 1;
    if (ag) {
      const lg = `${ag.status || '?'}/${ag.toutbox_classificacao || '—'}`;
      logisticaStrat[lg] = (logisticaStrat[lg] || 0) + 1;
    }

    const motivoInfo = motivoMap.get(k);
    const motivoFila = filas
      .map((f) => String(f.retorno_motivo || f.resultado_mensagem || '').trim())
      .find(Boolean);
    const motivo_recusar =
      (motivoInfo?.motivo || motivoFila || motivoInfo?.msg || '').trim() || null;
    const cancelamento = cancelamentoLabel(ce, ce?.ticket_status) || null;
    if (motivo_recusar) {
      motivoStrat[motivo_recusar] = (motivoStrat[motivo_recusar] || 0) + 1;
    }
    if (cancelamento) {
      const ck = (ce?.ticket_status || cancelamento).trim();
      cancelStrat[ck] = (cancelStrat[ck] || 0) + 1;
    }

    const filaResumo = filas
      .slice(0, 3)
      .map((f) => `${f.acao}:${f.status}`)
      .join(', ');

    items.push({
      proposta: k,
      fatia,
      order_number: ce?.order_number ?? null,
      order_status: ce?.order_status ?? null,
      ticket_status: ce?.ticket_status ?? null,
      ticket_number: ce?.ticket_number ?? null,
      tem_iccid: hasIccid(ce?.iccid || ag?.iccid, ce?.tim_chip),
      logistica: ag
        ? `${ag.status}/${ag.toutbox_classificacao || '—'}`
        : null,
      fila: filaResumo || null,
      motivo_recusar,
      cancelamento,
      updated_at:
        ag?.updated_at ||
        filas[0]?.updated_at ||
        ce?.ultimo_retorno_em ||
        ce?.enviada_em ||
        null,
    });
  }

  const universo = items.length;
  const somaFatias = Object.values(counts).reduce((a, b) => a + b, 0);
  const fechados =
    counts.sucesso_portado +
    counts.terminal_falha_parcial +
    counts.terminal_cancelada;
  const emVoo = universo - fechados;

  // Macro-grupos EXCLUSIVOS (soma = universo). Não misturar com waterfall progressivo.
  const grupoFechamento =
    counts.sucesso_portado +
    counts.terminal_falha_parcial +
    counts.terminal_cancelada;
  const grupoLogistica =
    counts.em_transito +
    counts.entregue_aguardando_chip +
    counts.entregue_com_chip +
    counts.quebra_logistica;
  const grupoFila =
    counts.bko +
    counts.fila_activate +
    counts.fila_reschedule +
    counts.fila_cancel +
    counts.fila_open +
    counts.fila_consult;
  const grupoTicket =
    counts.ticket_conflito +
    counts.ticket_pendente +
    counts.ticket_suspensa +
    counts.ticket_cancelamento_pendente;
  const grupoOrdem = counts.order_erro_aprov + counts.order_em_aprov;
  const grupoPre =
    counts.aguardando_ticket + counts.pre_os;
  const grupoOrfao = counts.orfao;

  const estagios = [
    {
      id: 'fechamento',
      label: 'Fechamento (Portado/Falha/Cancel.)',
      valor: grupoFechamento,
      exclusivo: true,
      fatias: ['sucesso_portado', 'terminal_falha_parcial', 'terminal_cancelada'],
    },
    {
      id: 'logistica',
      label: 'Logística Toutbox (só em andamento)',
      valor: grupoLogistica,
      exclusivo: true,
      fatias: [
        'em_transito',
        'entregue_aguardando_chip',
        'entregue_com_chip',
        'quebra_logistica',
      ],
    },
    {
      id: 'fila',
      label: 'Fila / BKO',
      valor: grupoFila,
      exclusivo: true,
      fatias: [
        'bko',
        'fila_activate',
        'fila_reschedule',
        'fila_cancel',
        'fila_open',
        'fila_consult',
      ],
    },
    {
      id: 'ticket',
      label: 'Ticket aberto (Conflito/Pend./…)',
      valor: grupoTicket,
      exclusivo: true,
      fatias: [
        'ticket_conflito',
        'ticket_pendente',
        'ticket_suspensa',
        'ticket_cancelamento_pendente',
      ],
    },
    {
      id: 'ordem',
      label: 'Ordem (Em/Erro Aprov)',
      valor: grupoOrdem,
      exclusivo: true,
      fatias: ['order_erro_aprov', 'order_em_aprov'],
    },
    {
      id: 'pre_os',
      label: 'Pré-OS / aguarda ticket',
      valor: grupoPre,
      exclusivo: true,
      fatias: ['aguardando_ticket', 'pre_os'],
    },
    {
      id: 'orfao',
      label: 'Órfão',
      valor: grupoOrfao,
      exclusivo: true,
      fatias: ['orfao'],
    },
  ].map((e) => ({
    ...e,
    pct: universo ? Math.round((e.valor / universo) * 1000) / 10 : 0,
  }));

  const somaGrupos = estagios.reduce((a, e) => a + e.valor, 0);

  // Funil de CONVERSÃO (progressivo — Portado ⊂ P+F ⊂ Fechados ⊂ Com ticket)
  const comOs = items.filter((i) => String(i.order_number || '').startsWith('1-')).length;
  const comTicket = items.filter((i) => (i.ticket_status || '').trim()).length;
  const sucessoTim = counts.sucesso_portado + counts.terminal_falha_parcial;
  const mapConv = (valor: number) => ({
    pct: universo ? Math.round((valor / universo) * 1000) / 10 : 0,
    pct_fechados: fechados ? Math.round((valor / fechados) * 1000) / 10 : 0,
  });
  const funil_conversao = [
    { id: 'universo', label: 'Universo do recorte', valor: universo, ...mapConv(universo) },
    { id: 'com_os', label: 'Com OS 1-*', valor: comOs, ...mapConv(comOs) },
    { id: 'com_ticket', label: 'Com ticket', valor: comTicket, ...mapConv(comTicket) },
    { id: 'fechados', label: 'Fechados (terminais)', valor: fechados, ...mapConv(fechados) },
    {
      id: 'sucesso_tim',
      label: 'Portado + Falha parcial',
      valor: sucessoTim,
      ...mapConv(sucessoTim),
    },
    {
      id: 'portado',
      label: 'Portado',
      valor: counts.sucesso_portado,
      ...mapConv(counts.sucesso_portado),
    },
  ];

  /** Fatias terminais + em voo — soma = universo (não some com ticket). */
  const funil_exclusivo = [
    { id: 'portado', label: 'Portado', valor: counts.sucesso_portado },
    { id: 'falha_parcial', label: 'Falha parcial', valor: counts.terminal_falha_parcial },
    { id: 'cancelada', label: 'Cancelada', valor: counts.terminal_cancelada },
    { id: 'em_voo', label: 'Em voo', valor: emVoo },
  ].map((e) => ({
    ...e,
    pct: universo ? Math.round((e.valor / universo) * 1000) / 10 : 0,
  }));

  const funil_pontes = {
    sem_os: Math.max(0, universo - comOs),
    os_sem_ticket: Math.max(0, comOs - comTicket),
    ticket_nao_fechado: Math.max(0, comTicket - fechados),
    nota:
      'Portado e Falha parcial contam juntos na taxa de sucesso TIM. Não some ticket + portado — portado já está dentro de “com ticket”.',
  };

  // Painel logística = detalhe do grupo exclusivo "logistica" (+ activate pós-entrega na fila)
  const logisticaBase = grupoLogistica;

  const logisticaPainel = {
    total: logisticaBase,
    nota:
      'Subconjunto exclusivo do universo (já contado acima). O restante está em Fechamento/Fila/Ticket/Ordem — não “sumiu”.',
    segmentos: [
      {
        id: 'em_transito',
        fatia: 'em_transito' as FatiaId,
        label: 'Em trânsito',
        count: counts.em_transito,
        cor: 'sky',
        hint: 'Postado / em trânsito / sem status de entrega ainda',
      },
      {
        id: 'entregue_aguardando_chip',
        fatia: 'entregue_aguardando_chip' as FatiaId,
        label: 'Entregue · sem ICCID',
        count: counts.entregue_aguardando_chip,
        cor: 'cyan',
        hint: 'Toutbox ENTREGUE; chip ainda não associado (CE/iSize)',
      },
      {
        id: 'entregue_com_chip',
        fatia: 'entregue_com_chip' as FatiaId,
        label: 'Entregue · com ICCID',
        count: counts.entregue_com_chip,
        cor: 'teal',
        hint: 'Entrega + chip OK — deve ir para activate',
      },
      {
        id: 'quebra_logistica',
        fatia: 'quebra_logistica' as FatiaId,
        label: 'Quebra / cancelada',
        count: counts.quebra_logistica,
        cor: 'red',
        hint: 'Cancelada, extravio ou max ciclos sem entrega/chip',
      },
    ].map((s) => ({
      ...s,
      pct: logisticaBase ? Math.round((s.count / logisticaBase) * 1000) / 10 : 0,
    })),
  };

  const fatias = (Object.keys(FATIA_META) as FatiaId[])
    .map((id) => ({
      id,
      ...FATIA_META[id],
      count: counts[id],
      pct: universo ? Math.round((counts[id] / universo) * 1000) / 10 : 0,
    }))
    .filter((f) => f.count > 0 || f.id === 'orfao')
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    ok: true as const,
    gerado_em: new Date().toISOString(),
    dia_brt_inicio: hoje,
    periodo: {
      mes: mesLabel,
      modo: opts.modo,
      inicio: start,
      fim: end,
      label:
        opts.modo === 'gerencial'
          ? `Gerencial · ${mesLabel}`
          : `Operacional · aberto + fechados ${mesLabel}`,
      definicao_metrica:
        opts.modo === 'gerencial'
          ? 'Cohort do mês. Taxa sucesso TIM = (Portado + Falha parcial) / universo. Taxa portado isolada também disponível.'
          : 'Livro aberto + fechamentos do mês. Taxa sucesso TIM = (Portado + Falha parcial) / universo.',
    },
    gerencial: {
      taxa_sucesso_tim_pct: universo
        ? Math.round((sucessoTim / universo) * 1000) / 10
        : 0,
      taxa_sucesso_tim_sobre_fechados_pct: fechados
        ? Math.round((sucessoTim / fechados) * 1000) / 10
        : 0,
      sucesso_tim: sucessoTim,
      taxa_portado_pct: universo
        ? Math.round((counts.sucesso_portado / universo) * 1000) / 10
        : 0,
      taxa_falha_parcial_pct: universo
        ? Math.round((counts.terminal_falha_parcial / universo) * 1000) / 10
        : 0,
      taxa_quebra_pct: universo
        ? Math.round((counts.quebra_logistica / universo) * 1000) / 10
        : 0,
      taxa_em_voo_pct: universo ? Math.round((emVoo / universo) * 1000) / 10 : 0,
      taxa_fechamento_pct: universo
        ? Math.round((fechados / universo) * 1000) / 10
        : 0,
      taxa_cancelamento_pct: universo
        ? Math.round((counts.terminal_cancelada / universo) * 1000) / 10
        : 0,
      taxa_portado_sobre_fechados_pct: fechados
        ? Math.round((counts.sucesso_portado / fechados) * 1000) / 10
        : 0,
      taxa_os_pct: universo ? Math.round((comOs / universo) * 1000) / 10 : 0,
      taxa_ticket_pct: universo ? Math.round((comTicket / universo) * 1000) / 10 : 0,
      portados: counts.sucesso_portado,
      falha_parcial: counts.terminal_falha_parcial,
      canceladas: counts.terminal_cancelada,
      fechados,
      quebras: counts.quebra_logistica,
      bko: counts.bko,
      com_os: comOs,
      com_ticket: comTicket,
    },
    reconciliacao: {
      universo,
      soma_fatias: somaFatias,
      soma_grupos: somaGrupos,
      fecha: universo === somaFatias && universo === somaGrupos && truncations.length === 0,
      confianca: truncations.length === 0 ? 'completa' : 'parcial',
      truncamentos: truncations,
      em_voo: emVoo,
      fechados,
      orfaos: counts.orfao,
      cobertura_cap: {
        ce_lidas:
          (cePeriodo as unknown[]).length +
          (cePortadosMes as unknown[]).length +
          (ceFalhaMes as unknown[]).length +
          (ceAbertas as unknown[]).length,
        ag_lidas: agRows.length,
        fila_lidas: filaVoo.length + (filaMotivos as unknown[]).length,
        nota: 'Fatias e macro-grupos são exclusivos (1 proposta = 1 lugar). Funil conversão é progressivo e NÃO soma o universo.',
      },
    },
    estagios,
    funil_conversao,
    funil_exclusivo,
    funil_pontes,
    logistica_painel: logisticaPainel,
    fatias,
    tickets: sortStrat(ticketStrat),
    ordens: sortStrat(orderStrat),
    logistica: sortStrat(logisticaStrat),
    motivos: sortStrat(motivoStrat),
    cancelamentos: sortStrat(cancelStrat),
    meta: FATIA_META,
    _items: items,
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-funil', 60_000, 30))) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = portabConfig(context.env);
  if (!cfg) {
    return json({ error: 'Secrets portabilidade ausentes.' }, 503);
  }

  const u = new URL(context.request.url);
  const fatia = (u.searchParams.get('fatia') || '') as FatiaId | '';
  const exportAll = u.searchParams.get('export') === '1';
  const limit = Math.min(exportAll ? 5000 : 200, Math.max(1, Number(u.searchParams.get('limit') || 80)));
  const offset = Math.max(0, parseInt(u.searchParams.get('offset') || '0', 10) || 0);
  const q = (u.searchParams.get('q') || '').trim().toLowerCase();
  const mesRaw = (u.searchParams.get('mes') || mesAtualBrt()).trim();
  const mes = mesBoundsBrt(mesRaw)?.label || mesAtualBrt();
  const modoParam = (u.searchParams.get('modo') || 'operacional').toLowerCase();
  const modo = modoParam === 'gerencial' ? 'gerencial' : 'operacional';

  try {
    const cacheKey = `${mes}:${modo}`;
    const cached = universoCache.get(cacheKey);
    let built: Awaited<ReturnType<typeof montarUniverso>>;
    if (cached && cached.exp > Date.now()) {
      built = cached.data as Awaited<ReturnType<typeof montarUniverso>>;
    } else {
      built = await montarUniverso(cfg, { mes, modo });
      universoCache.set(cacheKey, { data: built, exp: Date.now() + CACHE_TTL_MS });
    }
    const { _items, ...resumo } = built;

    if (fatia && FATIA_META[fatia]) {
      let list = _items.filter((i) => i.fatia === fatia);
      if (q) {
        list = list.filter(
          (i) =>
            i.proposta.toLowerCase().includes(q) ||
            String(i.order_number || '').toLowerCase().includes(q) ||
            String(i.ticket_status || '').toLowerCase().includes(q) ||
            String(i.motivo_recusar || '').toLowerCase().includes(q) ||
            String(i.cancelamento || '').toLowerCase().includes(q),
        );
      }

      const estOrder: Record<string, number> = {};
      const estTicket: Record<string, number> = {};
      const estMotivo: Record<string, number> = {};
      const estCancel: Record<string, number> = {};
      const estLog: Record<string, number> = {};
      for (const it of list) {
        const o = (it.order_status || '').trim() || '(sem order)';
        const t = (it.ticket_status || '').trim() || '(sem ticket)';
        const m = (it.motivo_recusar || '').trim() || '(sem motivo)';
        const c = (it.cancelamento || it.ticket_status || '').trim() || '(sem cancelamento)';
        const l = (it.logistica || '').trim() || '(sem logística)';
        estOrder[o] = (estOrder[o] || 0) + 1;
        estTicket[t] = (estTicket[t] || 0) + 1;
        estMotivo[m] = (estMotivo[m] || 0) + 1;
        if (c.toLowerCase().includes('cancel') || it.fatia === 'terminal_cancelada') {
          estCancel[c] = (estCancel[c] || 0) + 1;
        }
        estLog[l] = (estLog[l] || 0) + 1;
      }

      // Detalhe ordenado: maior estratificação (motivo) primeiro
      const motivoRank = Object.fromEntries(
        Object.entries(estMotivo).map(([k, v]) => [k, v]),
      );
      list.sort((a, b) => {
        const ma = (a.motivo_recusar || '').trim() || '(sem motivo)';
        const mb = (b.motivo_recusar || '').trim() || '(sem motivo)';
        const ca = motivoRank[ma] || 0;
        const cb = motivoRank[mb] || 0;
        if (cb !== ca) return cb - ca;
        const oa = (a.order_status || '').localeCompare(b.order_status || '');
        if (oa !== 0) return oa;
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      });

      const page = exportAll ? list.slice(0, limit) : list.slice(offset, offset + limit);
      return json({
        ok: true,
        fatia,
        meta: FATIA_META[fatia],
        total: list.length,
        limit,
        offset: exportAll ? 0 : offset,
        export: exportAll,
        items: page,
        estratificacao: {
          motivo_recusar: sortStrat(estMotivo),
          cancelamento: sortStrat(estCancel),
          order_status: sortStrat(estOrder),
          ticket_status: sortStrat(estTicket),
          logistica: sortStrat(estLog),
        },
        periodo: resumo.periodo,
        reconciliacao: resumo.reconciliacao,
      });
    }

    return json({
      ...resumo,
      meta_mes: resolveMetaPortados(context.env, mes, resumo.reconciliacao?.universo),
    });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc);
    return json({ error: msg }, 502);
  }
}
