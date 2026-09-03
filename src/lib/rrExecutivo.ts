/**
 * Snapshot executivo RR (Resultado Realizado) — agrega EVA + nowcast + ofensores.
 */
import {
  consolidarSupervisores,
  matchCampanhaComercial,
  type CampanhaOp,
  type EvaAtivo,
  type EvaJornada,
  type EvaHoraSupervisor,
  type EvaSerieHora,
  type SupervisorResumo,
} from './evaDash';
import { buildNowcast, type NowcastSup } from './horaPageData';
import { listarOfensores, type AnaliseOperador } from './ofensorOp';

export type RrSupRow = {
  supervisor: string;
  vendas: number;
  metaDia: number;
  gap: number;
  pctMeta: number;
  pctCpc: number;
  logados: number;
  operadores: number;
  alertaCpc: boolean;
};

export type RrDestaque = {
  tipo: 'melhor' | 'pior' | 'ofensor';
  titulo: string;
  detalhe: string;
  valor?: string;
};

export type RrSnapshot = {
  dataRef: string;
  campanha: string;
  vendas: number;
  metaDia: number;
  gap: number;
  gapPct: number;
  pctMetaDia: number;
  metaRestante: number;
  horasRestantes: number;
  metaHoraRestante: number;
  logados: number;
  ofensoresCriticos: number;
  ofensoresAltos: number;
  pctCpcGeral: number;
  supervisores: RrSupRow[];
  ofensores: AnaliseOperador[];
  destaques: RrDestaque[];
  nowcastSup: NowcastSup[];
};

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function buildRrSnapshot(opts: {
  dataRef: string;
  campanha: CampanhaOp;
  horaAtual: string;
  serie: EvaSerieHora[];
  horaSupervisor: EvaHoraSupervisor[];
  jornada: EvaJornada[];
  ativos?: EvaAtivo[];
  metaVendasMes: number;
  expedienteHoras: number;
}): RrSnapshot {
  const {
    dataRef,
    campanha,
    horaAtual,
    serie,
    horaSupervisor,
    jornada,
    ativos = [],
    metaVendasMes,
    expedienteHoras,
  } = opts;

  const serieF = serie.filter((r) => matchCampanhaComercial(r, campanha));
  const supH = horaSupervisor.filter((r) => matchCampanhaComercial(r, campanha));
  const jornF = jornada.filter((j) => matchCampanhaComercial(j, campanha));
  const ativosF = ativos.filter((a) => matchCampanhaComercial(a, campanha));
  const supervisorOps = new Map<string, Set<string>>();
  for (const row of jornF) {
    const sup = row.supervisor_name || 'Sem supervisor';
    const login = row.login || String(row.id_user);
    if (!supervisorOps.has(sup)) supervisorOps.set(sup, new Set());
    supervisorOps.get(sup)!.add(login);
  }
  const supervisorWeights = Object.fromEntries(
    [...supervisorOps].map(([sup, logins]) => [sup, logins.size]),
  );

  const nowcast = buildNowcast(
    serieF,
    supH,
    metaVendasMes,
    expedienteHoras,
    dataRef,
    horaAtual,
    supervisorWeights,
  );
  const supResumo = consolidarSupervisores(jornF, ativosF);
  const bySup = new Map(supResumo.map((s) => [s.supervisor, s]));
  const nowBySup = new Map(nowcast.supRows.map((s) => [s.supervisor, s]));

  const names = new Set([...bySup.keys(), ...nowBySup.keys()]);
  const supervisores: RrSupRow[] = [...names]
    .map((name) => {
      const nc = nowBySup.get(name);
      const sr = bySup.get(name) as SupervisorResumo | undefined;
      const vendas = nc?.vendidoAteAgora ?? sr?.sucesso ?? 0;
      const metaDia = nc?.metaDiaSup ?? 0;
      const gap = nc?.gapSup ?? vendas - metaDia;
      return {
        supervisor: name,
        vendas,
        metaDia,
        gap,
        pctMeta: pct(vendas, metaDia),
        pctCpc: sr?.pct_cpc ?? 0,
        logados: sr?.logados ?? 0,
        operadores: sr?.operadores ?? 0,
        alertaCpc: sr?.alerta_cpc ?? false,
      };
    })
    .sort((a, b) => b.pctMeta - a.pctMeta || b.vendas - a.vendas);

  const ofensores = listarOfensores(jornF).filter((o) => o.ofensor);
  const criticos = ofensores.filter((o) => o.nivel === 'critico');
  const altos = ofensores.filter((o) => o.nivel === 'alto');

  const destaques: RrDestaque[] = [];
  // supervisores está ordenado por pctMeta DESC; top = melhores, bottom = piores.
  const supComMeta = supervisores.filter((s) => s.metaDia > 0);
  const topN = Math.min(3, Math.floor(supComMeta.length / 2));
  const top = supComMeta.slice(0, topN);
  // Bug fix: bottom é o fim da lista (piores), não o início da lista invertida —
  // com poucos supervisores, top e bottom podiam cobrir todos e o loop filtrava tudo.
  const bottom = supComMeta.slice(Math.max(topN, supComMeta.length - 3));
  const topSet = new Set(top.map((s) => s.supervisor));
  for (const s of top) {
    destaques.push({
      tipo: 'melhor',
      titulo: s.supervisor,
      detalhe: `${s.vendas} vendas · ${s.pctMeta}% da meta`,
      valor: `${s.pctMeta}%`,
    });
  }
  for (const s of bottom) {
    if (topSet.has(s.supervisor)) continue;
    destaques.push({
      tipo: 'pior',
      titulo: s.supervisor,
      detalhe: `Gap ${s.gap} · CPC ${s.pctCpc}%`,
      valor: `${s.gap > 0 ? '+' : ''}${s.gap}`,
    });
  }
  for (const o of criticos.slice(0, 3)) {
    destaques.push({
      tipo: 'ofensor',
      titulo: o.nome || o.login,
      detalhe: `${o.supervisor} · ${o.focos[0]?.titulo || o.nivel}`,
      valor: o.nivel,
    });
  }

  const cpc = jornF.reduce((a, j) => a + (j.cpc || 0), 0);
  const tab = jornF.reduce((a, j) => a + (j.tabuladas || 0), 0);

  return {
    dataRef,
    campanha,
    vendas: nowcast.vendasTotal,
    metaDia: nowcast.metaDia,
    gap: nowcast.gapAcum,
    gapPct: nowcast.gapPct,
    pctMetaDia: pct(nowcast.vendasTotal, nowcast.metaDia),
    metaRestante: nowcast.metaRestanteTotal,
    horasRestantes: nowcast.horasRestantes,
    metaHoraRestante: nowcast.metaHoraRestante,
    logados: ativos.length ? ativosF.length : supResumo.reduce((a, s) => a + (s.logados || 0), 0),
    ofensoresCriticos: criticos.length,
    ofensoresAltos: altos.length,
    pctCpcGeral: pct(cpc, tab),
    supervisores,
    ofensores: ofensores.slice(0, 12),
    destaques,
    nowcastSup: nowcast.supRows,
  };
}

/** Gap de ritmo: positivo = acima da meta projetada (não é “falta”). */
export function labelGapRitmo(gap: number): { texto: string; acima: boolean; abaixo: boolean } {
  if (gap > 0) return { texto: `Acima do ritmo +${gap}`, acima: true, abaixo: false };
  if (gap < 0) return { texto: `Abaixo do ritmo ${gap}`, acima: false, abaixo: true };
  return { texto: 'No ritmo', acima: false, abaixo: false };
}
