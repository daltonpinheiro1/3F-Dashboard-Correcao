import { sbFetch } from './auth';

export type CohortRpc = {
  mes?: string;
  portados?: number;
  falha_parcial?: number;
  canceladas?: number;
  fechados?: number;
  sucesso_tim?: number;
  universo?: number;
  quebras?: number;
  bko?: number;
  execucoes?: number;
  exec_ok?: number;
  activate_ok?: number;
  taxa_portado_pct?: number;
  taxa_sucesso_tim_pct?: number;
  taxa_sucesso_fila_pct?: number;
};

/** Snapshot de coorte gravado pela VM (snapshot_disparos_fila.py); só vale depois de congelado. */
export async function cohortCongelada(
  env: Parameters<typeof sbFetch>[0],
  mesLabel: string,
): Promise<CohortRpc | null> {
  try {
    const r = await sbFetch(env, `/storage/v1/object/eva-dash/portabilidade/cohort/${mesLabel}.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const body = (await r.json().catch(() => null)) as { congelado?: boolean; rpc?: CohortRpc } | null;
    return body?.congelado && body.rpc && typeof body.rpc.portados === 'number' ? body.rpc : null;
  } catch {
    return null;
  }
}

export type GerencialResumo = Record<string, unknown> & {
  taxa_os_pct?: number;
  taxa_ticket_pct?: number;
  com_os?: number;
  com_ticket?: number;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Mês fechado: o CE perde linhas com o cleanup, então a coorte viva encolhe.
 * Resultado (portados/falha/canceladas/quebras) vem da coorte congelada;
 * cobertura de OS/ticket continua do CE (não existe no snapshot).
 */
type CampoResultado =
  | 'taxa_sucesso_tim_pct'
  | 'taxa_sucesso_tim_sobre_fechados_pct'
  | 'sucesso_tim'
  | 'taxa_portado_pct'
  | 'taxa_falha_parcial_pct'
  | 'taxa_quebra_pct'
  | 'taxa_em_voo_pct'
  | 'taxa_fechamento_pct'
  | 'taxa_cancelamento_pct'
  | 'taxa_portado_sobre_fechados_pct'
  | 'portados'
  | 'falha_parcial'
  | 'canceladas'
  | 'fechados'
  | 'quebras'
  | 'bko';

export function aplicarCohortGerencial<T extends GerencialResumo>(
  ger: T,
  rpc: CohortRpc | null,
): T & Partial<Record<CampoResultado, number>> & {
  fonte: 'cohort_congelada' | 'ce_vivo';
  universo_cohort?: number;
} {
  const u = rpc?.universo ?? 0;
  if (!rpc || !(u > 0)) return { ...ger, fonte: 'ce_vivo' };
  const portados = rpc.portados ?? 0;
  const falha = rpc.falha_parcial ?? 0;
  const canceladas = rpc.canceladas ?? 0;
  const fechados = rpc.fechados ?? portados + falha + canceladas;
  const sucesso = rpc.sucesso_tim ?? portados + falha;
  const quebras = rpc.quebras ?? 0;
  const emVoo = Math.max(0, u - fechados - quebras);
  return {
    ...ger,
    taxa_sucesso_tim_pct: pct(sucesso, u),
    taxa_sucesso_tim_sobre_fechados_pct: pct(sucesso, fechados),
    sucesso_tim: sucesso,
    taxa_portado_pct: pct(portados, u),
    taxa_falha_parcial_pct: pct(falha, u),
    taxa_quebra_pct: pct(quebras, u),
    taxa_em_voo_pct: pct(emVoo, u),
    taxa_fechamento_pct: pct(fechados, u),
    taxa_cancelamento_pct: pct(canceladas, u),
    taxa_portado_sobre_fechados_pct: pct(portados, fechados),
    portados,
    falha_parcial: falha,
    canceladas,
    fechados,
    quebras,
    bko: rpc.bko ?? (ger.bko as number | undefined) ?? 0,
    fonte: 'cohort_congelada',
    universo_cohort: u,
  };
}
