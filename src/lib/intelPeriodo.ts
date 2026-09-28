/** CPC/DROP do período (snapshots EVA diários) e janela de cada eixo do Risk Radar. */

import {
  dropRate,
  matchCampanha,
  resolveDiscagens,
  type CampanhaOp,
  type EvaPayload,
} from './evaDash';
import { extractEvaSignals } from './inteligenciaSnapshot';

export type EvaPeriodoSignals = {
  de: string;
  ate: string;
  dias_pedidos: number;
  dias_com_dados: number;
  faltando: string[];
  cpc_pct?: number;
  cpc_casa_pct?: number;
  tabuladas_casa: number;
  eva_drop_pct?: number;
  eva_drop_casa_pct?: number;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Peso do dialer no dia: mesmas tabuladas que dialerRatesChip usa como denominador. */
function tabuladasDialer(eva: EvaPayload, campanha: CampanhaOp): number {
  const disc = resolveDiscagens(eva);
  if (campanha === 'TODAS') return Number(disc.kpis?.tabuladas || 0);
  const slices = (disc.por_campanha || []).filter((r) => matchCampanha(r, campanha));
  const serie = (disc.serie_hora || []).filter((r) => matchCampanha(r, campanha));
  const src = slices.length ? slices : serie;
  return src.reduce((s, r) => s + Number(r.tabuladas || 0), 0);
}

export function agregarEvaPeriodo(
  dias: EvaPayload[],
  opts: { de: string; ate: string; diasPedidos: number; faltando?: string[]; campanha?: CampanhaOp },
): EvaPeriodoSignals {
  const campanha = opts.campanha || 'TODAS';
  let cpcCasaN = 0;
  let tabsCasa = 0;
  let dropCasaN = 0;
  let dropCasaTabs = 0;
  let cpcDialPond = 0;
  let dropDialPond = 0;
  let pesoCpcDial = 0;
  let pesoDropDial = 0;

  for (const eva of dias) {
    const s = extractEvaSignals(eva, Date.now(), campanha);
    cpcCasaN += s.cpc_casa_n || 0;
    tabsCasa += s.tabuladas_casa || 0;
    dropCasaN += s.eva_drop_casa_n || 0;
    dropCasaTabs += s.eva_drop_casa_tabs || 0;
    const w = tabuladasDialer(eva, campanha);
    if (w > 0 && s.cpc_pct != null) {
      cpcDialPond += s.cpc_pct * w;
      pesoCpcDial += w;
    }
    if (w > 0 && s.eva_drop_pct != null) {
      dropDialPond += s.eva_drop_pct * w;
      pesoDropDial += w;
    }
  }

  return {
    de: opts.de,
    ate: opts.ate,
    dias_pedidos: opts.diasPedidos,
    dias_com_dados: dias.length,
    faltando: opts.faltando || [],
    cpc_pct: pesoCpcDial ? r1(cpcDialPond / pesoCpcDial) : undefined,
    cpc_casa_pct: tabsCasa ? r1((100 * cpcCasaN) / tabsCasa) : undefined,
    tabuladas_casa: tabsCasa,
    eva_drop_pct: pesoDropDial ? r1(dropDialPond / pesoDropDial) : undefined,
    eva_drop_casa_pct: dropCasaTabs ? dropRate(dropCasaN, dropCasaTabs) : undefined,
  };
}

export type JanelaEixo = 'período' | 'ao vivo';

const EIXOS_PERIODO = new Set(['erro-alto', 'erro-subindo', 'erro-acelerando', 'erro-concentrado']);
const EIXOS_EVA = new Set(['cpc-baixo', 'eva-drop']);
const EIXOS_AO_VIVO = new Set([
  'eva-stale',
  'atestados-fila',
  'inss-sla',
  'adv-pendente',
  'adv-critico',
  'port-p0',
  'port-fila',
  'port-envelhecido',
  'port-bko',
  'port-falha',
]);

/** Janela real do eixo: CPC/DROP só seguem o período se houver snapshot EVA nele. */
export function janelaEixoRadar(id: string, temEvaPeriodo: boolean): JanelaEixo | null {
  if (EIXOS_PERIODO.has(id)) return 'período';
  if (EIXOS_EVA.has(id)) return temEvaPeriodo ? 'período' : 'ao vivo';
  if (EIXOS_AO_VIVO.has(id)) return 'ao vivo';
  return null;
}

export function periodoIncluiHoje(de: string, ate: string, hoje: string): boolean {
  return de <= hoje && hoje <= ate;
}
