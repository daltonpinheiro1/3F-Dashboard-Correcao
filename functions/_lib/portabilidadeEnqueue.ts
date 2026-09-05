/**
 * Lógica compartilhada — enfileirar ação TIM (single ou lote).
 */
import { normalizePropostaInput, propostaNumero, validateProposta } from './portabilidade';

export const ACOES_FILA = ['consult', 'cancel', 'open', 'activate', 'reschedule'] as const;
export type AcaoFila = (typeof ACOES_FILA)[number];

export const ENDPOINTS: Record<AcaoFila, string> = {
  consult: '/importers/siebel/portability/consult',
  cancel: '/importers/siebel/portability/cancel',
  open: '/importers/siebel/portability/open',
  activate: '/importers/siebel/chip/activation',
  reschedule: '/importers/siebel/portability/reschedule',
};

const INVALID_OS = new Set(['', '0-00', '0', '00', '-', '0-0', 'none', 'null']);
export const BATCH_MAX = 25;

export type EnqueueOneResult =
  | { ok: true; proposta: string; fila_id?: number | null; duplicata?: boolean; mensagem: string }
  | { ok: false; proposta: string; error: string; status: number };

type Cfg = { url: string; key: string };

function sbHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function limparCpf(v: string): string {
  return (v || '').replace(/\D/g, '').slice(0, 11);
}

function limparTel(v: string): string {
  return (v || '').replace(/\D/g, '').slice(0, 11);
}

async function sbGet(cfg: Cfg, table: string, params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${cfg.url}/rest/v1/${table}?${q}`, {
    headers: { ...sbHeaders(cfg.key), Accept: 'application/json' },
  });
  if (!r.ok) return [];
  return (await r.json()) as Array<Record<string, unknown>>;
}

export async function enqueueProposta(opts: {
  cfg: Cfg;
  propostaRaw: string;
  acao: AcaoFila;
  userEmail: string;
}): Promise<EnqueueOneResult> {
  const proposta = validateProposta(normalizePropostaInput(opts.propostaRaw));
  if (!proposta) {
    return { ok: false, proposta: opts.propostaRaw, error: 'Proposta inválida.', status: 400 };
  }

  const { acao, cfg, userEmail } = opts;
  const numero = propostaNumero(proposta);
  const propFilter = `(proposta_isize.eq.${proposta},proposta_isize.eq.${numero})`;
  const filtroLike = `like.*${numero}*`;
  const cutoff2h = new Date(Date.now() - 2 * 3600_000).toISOString();

  const [ceRowsInit, filaPend, filaCooldown] = await Promise.all([
    sbGet(cfg, 'consultas_enviadas_pos_aceite', {
      or: propFilter,
      select: 'proposta_isize,cpf,telefone,temporary_access_number,order_number,portability_date,order_status,ticket_status',
      limit: '1',
    }),
    sbGet(cfg, 'fila_acoes_portabilidade', {
      proposta_isize: filtroLike,
      acao: `eq.${acao}`,
      status: 'in.(pendente,executando,bko)',
      select: 'id,status,acao',
      limit: '1',
    }),
    sbGet(cfg, 'fila_acoes_portabilidade', {
      proposta_isize: filtroLike,
      acao: `eq.${acao}`,
      status: 'eq.concluida',
      executed_at: `gte.${cutoff2h}`,
      select: 'id',
      limit: '1',
    }),
  ]);

  if (filaPend.length > 0) {
    return {
      ok: true,
      proposta,
      duplicata: true,
      fila_id: filaPend[0]?.id as number | undefined,
      mensagem: `Ação ${acao} já pendente.`,
    };
  }

  if (filaCooldown.length > 0) {
    return {
      ok: false,
      proposta,
      error: `Ação ${acao} concluída há menos de 2h. Cooldown.`,
      status: 429,
    };
  }

  let ceRows = ceRowsInit;
  if (!ceRows.length) {
    ceRows = await sbGet(cfg, 'consultas_enviadas_pos_aceite', {
      proposta_isize: filtroLike,
      select: 'proposta_isize,cpf,telefone,temporary_access_number,order_number,portability_date,order_status,ticket_status',
      limit: '1',
    });
  }

  if (!ceRows.length) {
    return { ok: false, proposta, error: 'Proposta não encontrada no CE.', status: 404 };
  }

  const ceFinal = ceRows[0]!;
  const cpf = limparCpf(String(ceFinal.cpf || ''));
  const telefone = limparTel(String(ceFinal.telefone || ''));
  if (cpf.length !== 11) {
    return { ok: false, proposta, error: 'CPF inválido ou ausente.', status: 422 };
  }
  if (telefone.length < 10) {
    return { ok: false, proposta, error: 'Telefone inválido ou ausente.', status: 422 };
  }
  const temp = limparTel(String(ceFinal.temporary_access_number || ''));
  if (acao === 'open' && temp.length >= 10 && telefone === temp) {
    return {
      ok: false,
      proposta,
      error: 'Telefone portado igual à linha TIM. Aguarde a revisão iSize.',
      status: 422,
    };
  }

  const orderNumber = String(ceFinal.order_number || '').trim();
  const portabilityActions: AcaoFila[] = ['reschedule', 'cancel', 'open'];
  if (portabilityActions.includes(acao) && INVALID_OS.has(orderNumber.toLowerCase())) {
    return {
      ok: false,
      proposta,
      error: `OS inválida (${orderNumber || 'vazia'}) para ${acao}.`,
      status: 422,
    };
  }

  const record = {
    proposta_isize: numero,
    external_code: proposta,
    cpf,
    telefone,
    order_number: orderNumber,
    acao,
    endpoint: ENDPOINTS[acao],
    portability_date: String(ceFinal.portability_date || ''),
    retorno_status_ordem: String(ceFinal.order_status || ''),
    retorno_motivo: `dashboard_manual:${userEmail}`,
    retorno_payload: {},
    status: 'pendente',
    tentativas: 0,
    max_tentativas: 3,
    executar_apos: new Date().toISOString(),
    origem_retorno_id: '',
    resultado_mensagem: `Enfileirado via dashboard por ${userEmail}`,
  };

  const ins = await fetch(`${cfg.url}/rest/v1/fila_acoes_portabilidade`, {
    method: 'POST',
    headers: { ...sbHeaders(cfg.key), Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });

  if (!ins.ok) {
    const txt = await ins.text();
    if (ins.status === 409 || /23505|duplicate key|unique/i.test(txt)) {
      return {
        ok: true,
        proposta,
        duplicata: true,
        mensagem: `Ação ${acao} já pendente.`,
      };
    }
    console.error('[portabilidade-enqueue]', proposta, ins.status, txt.slice(0, 160));
    return { ok: false, proposta, error: 'Falha ao inserir na fila.', status: 502 };
  }

  const inserted = (await ins.json()) as Array<{ id?: number }>;
  return {
    ok: true,
    proposta,
    fila_id: inserted[0]?.id ?? null,
    mensagem: `${acao} enfileirado.`,
  };
}
