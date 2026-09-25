import type {
  MailingCurvaPonto,
  MailingDistribuicao,
  MailingHealth,
  MailingHora,
  MailingItem,
  MailingRecomendacao,
  MailingSaude,
  MailingTendencia,
} from '../../shared/contracts/mailing';

export type CampanhaMailing = 'TODAS' | string;

export const POR_DISCAGENS = 100_000;
export const POR_MILHAO = 1_000_000;
export const FOLEGO_ALERTA_DIAS = 1.5;

export type MailingFunilEtapa = {
  id: string;
  label: string;
  valor: number;
  /** Conversão vs etapa anterior (null na 1ª). */
  convAnterior: number | null;
  /** Conversão vs tentativas. */
  convBase: number;
};

export type MailingVisao = {
  mailings: MailingItem[];
  tentativas: number;
  phones: number;
  alo_robo: number;
  contatos: number;
  sucesso: number;
  giro: number;
  taxa_alo: number;
  taxa_contato: number;
  taxa_transferencia: number;
  taxa_sucesso_contato: number;
  sucesso_100mil: number;
  /** Sucessos estimados a cada 1 milhão de tentativas (mesmo ritmo do recorte). */
  sucesso_1mi: number;
  sucesso_1mi_ic: [number, number];
  disponiveis: number;
  folego_dias: number | null;
  desgaste_medio: number | null;
  previsao_contatos: number;
  previsao_contatos_ic: [number, number];
  previsao_sucesso: number;
  previsao_sucesso_ic: [number, number];
  tendencia: MailingTendencia;
  curva: MailingCurvaPonto[];
  serie_hora: MailingHora[];
  recomendacoes: MailingRecomendacao[];
  distribuicao: MailingDistribuicao[];
  insistencia_pct: number | null;
  /** Dist agregada cobre todos os mailings com volume do recorte. */
  dist_cobertura_completa: boolean;
  funil: MailingFunilEtapa[];
  serie_hora_enriquecida: MailingHoraEnriquecida[];
  por_regiao: Array<{
    regiao: string;
    tentativas: number;
    contatos: number;
    sucesso: number;
    taxa_contato: number;
    sucesso_1mi: number;
    /** Parcela das tentativas do recorte nesta região. */
    share_pct: number;
    phones?: number;
    pct_virgin?: number | null;
    pct_saturado?: number | null;
  }>;
  /** Aderência média (contato real÷esperado) das horas fechadas com base. */
  aderencia_media: number | null;
  /** Melhores janelas horárias do recorte (por praça). */
  politica_regiao: Array<{
    regiao: string;
    melhor_hora: string;
    melhor_taxa: number;
    janelas: Array<{ hora: string; tentativas: number; taxa_contato: number }>;
  }>;
  /** Health agregado do recorte (média ponderada). */
  health: MailingHealth | null;
};

export function wilson(x: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 0];
  const p = x / n;
  const den = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / den;
  const meia = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, centro - meia), Math.min(1, centro + meia)];
}

export function poisson90(lam: number): [number, number] {
  if (lam <= 0) return [0, 0];
  const m = 1.645 * Math.sqrt(lam);
  return [Math.max(0, lam - m), lam + m];
}

/** Mínimos quadrados ponderados (peso = tentativas), mesmo cálculo do coletor. */
export function tendencia(pontos: Array<[number, number, number]>): MailingTendencia {
  const pts = pontos.filter(([, , w]) => w > 0);
  const vazio = { inclinacao: 0, rel_hora: 0, t: 0, significativa: false, pontos: pts.length };
  if (pts.length < 3) return vazio;
  const sw = pts.reduce((a, [, , w]) => a + w, 0);
  const mx = pts.reduce((a, [x, , w]) => a + w * x, 0) / sw;
  const my = pts.reduce((a, [, y, w]) => a + w * y, 0) / sw;
  const sxx = pts.reduce((a, [x, , w]) => a + w * (x - mx) ** 2, 0);
  if (sxx <= 0) return vazio;
  const b = pts.reduce((a, [x, y, w]) => a + w * (x - mx) * (y - my), 0) / sxx;
  const a0 = my - b * mx;
  const resid = pts.reduce((a, [x, y, w]) => a + w * (y - (a0 + b * x)) ** 2, 0);
  const gl = pts.length - 2;
  const se = gl > 0 && resid > 0 ? Math.sqrt(resid / gl / sxx) : 0;
  const t = se > 0 ? b / se : 0;
  return {
    inclinacao: b,
    rel_hora: my > 0 ? b / my : 0,
    t,
    significativa: Math.abs(t) >= 2,
    pontos: pts.length,
  };
}

export function somarCurvas(curvas: MailingCurvaPonto[][]): MailingCurvaPonto[] {
  const por = new Map<number, { rotulo?: string; em_risco: number; contatos: number }>();
  for (const curva of curvas) {
    for (const p of curva) {
      const acc = por.get(p.k) || { rotulo: p.rotulo, em_risco: 0, contatos: 0 };
      acc.em_risco += p.em_risco;
      acc.contatos += p.contatos;
      por.set(p.k, acc);
    }
  }
  let sobrevive = 1;
  return [...por.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => {
      const taxa = v.em_risco ? v.contatos / v.em_risco : 0;
      const [lo, hi] = wilson(v.contatos, v.em_risco);
      sobrevive *= 1 - taxa;
      return {
        k,
        rotulo: v.rotulo ?? String(k),
        em_risco: v.em_risco,
        contatos: v.contatos,
        taxa,
        ic_baixo: lo,
        ic_alto: hi,
        acumulada: 1 - sobrevive,
      };
    });
}

export function somarHoras(series: MailingHora[][]): MailingHora[] {
  const por = new Map<string, MailingHora>();
  for (const serie of series) {
    for (const h of serie) {
      const acc = por.get(h.hora) || { hora: h.hora, tentativas: 0, alo_robo: 0, contatos: 0, sucesso: 0, taxa: 0 };
      acc.tentativas += h.tentativas;
      acc.alo_robo += h.alo_robo || 0;
      acc.contatos += h.contatos;
      acc.sucesso += h.sucesso;
      por.set(h.hora, acc);
    }
  }
  return [...por.values()]
    .sort((a, b) => a.hora.localeCompare(b.hora))
    .map((h) => ({ ...h, taxa: h.tentativas ? h.contatos / h.tentativas : 0 }));
}

/** Hora cheia de updated_at (horário de Brasília): horas anteriores estão fechadas. */
export function horaAtual(updatedAt: string): number {
  const m = /T(\d{2}):/.exec(updatedAt);
  return m ? Number(m[1]) : 24;
}

export function somarDistribuicoes(dists: MailingDistribuicao[][]): MailingDistribuicao[] {
  const por = new Map<number, { rotulo: string; phones: number; contatos: number; sucesso: number }>();
  for (const dist of dists) {
    for (const d of dist) {
      const acc = por.get(d.n) || { rotulo: d.rotulo, phones: 0, contatos: 0, sucesso: 0 };
      acc.phones += d.phones;
      acc.contatos += d.contatos;
      acc.sucesso += d.sucesso;
      por.set(d.n, acc);
    }
  }
  const total = [...por.values()].reduce((a, v) => a + v.phones, 0) || 1;
  return [...por.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, v]) => ({
      n,
      rotulo: v.rotulo,
      phones: v.phones,
      pct: Math.round((10_000 * v.phones) / total) / 100,
      contatos: v.contatos,
      sucesso: v.sucesso,
    }));
}

export function insistenciaDeDist(dist: MailingDistribuicao[], tentativas: number): number | null {
  if (tentativas <= 0 || dist.length === 0) return null;
  const gasto = dist.filter((d) => d.n >= 5).reduce((a, d) => a + d.n * d.phones, 0);
  return Math.round((10_000 * gasto) / tentativas) / 100;
}

export function funilVendas(opts: {
  tentativas: number;
  alo_robo: number;
  contatos: number;
  sucesso: number;
  comRobo: boolean;
}): MailingFunilEtapa[] {
  const { tentativas: t, alo_robo: a, contatos: c, sucesso: s, comRobo } = opts;
  const base = Math.max(t, 1);
  const etapas: MailingFunilEtapa[] = [
    { id: 'tentativas', label: 'Tentativas', valor: t, convAnterior: null, convBase: 1 },
  ];
  if (comRobo) {
    etapas.push({
      id: 'alo',
      label: 'Alô robô',
      valor: a,
      convAnterior: t ? a / t : 0,
      convBase: a / base,
    });
  }
  etapas.push({
    id: 'contato',
    label: 'Contato agente',
    valor: c,
    convAnterior: comRobo ? (a ? c / a : 0) : t ? c / t : 0,
    convBase: c / base,
  });
  etapas.push({
    id: 'sucesso',
    label: 'Sucesso (venda)',
    valor: s,
    convAnterior: c ? s / c : 0,
    convBase: s / base,
  });
  return etapas;
}

export type MailingHoraEnriquecida = MailingHora & {
  /** Contato % esperado com base nas horas fechadas anteriores (estático após fechar). */
  taxa_esperada: number | null;
  /** Contatos esperados = tentativas × taxa_esperada. */
  contatos_esperados: number | null;
  /** real ÷ esperado (contato); null se sem base. */
  aderencia: number | null;
  /** Hora ainda aberta no relógio do snapshot. */
  aberta: boolean;
};

/**
 * Expectativa de contato por hora:
 * - taxa_esperada(h) = taxa ponderada das horas estritamente anteriores e já fechadas
 * - hora aberta: mesma regra (base = fechadas até agora) → atualiza a cada coleta
 * - hora fechada: valor congelado na lógica leave-past (não usa o futuro do dia)
 */
export function enriquecerSerieHora(serie: MailingHora[], updatedAt: string): MailingHoraEnriquecida[] {
  const agora = horaAtual(updatedAt);
  const ordenada = [...serie].sort((a, b) => a.hora.localeCompare(b.hora));
  let acumT = 0;
  let acumC = 0;
  return ordenada.map((h) => {
    const hn = Number(h.hora);
    const aberta = Number.isFinite(hn) && hn >= agora;
    const taxaEsp = acumT > 0 ? acumC / acumT : null;
    const contatosEsp = taxaEsp != null ? taxaEsp * h.tentativas : null;
    const aderencia =
      taxaEsp != null && taxaEsp > 0 && h.tentativas > 0 ? h.taxa / taxaEsp : null;
    // Só horas fechadas entram na base da próxima (aberta não contamina o passado).
    if (!aberta && h.tentativas > 0) {
      acumT += h.tentativas;
      acumC += h.contatos;
    }
    return {
      ...h,
      taxa_esperada: taxaEsp,
      contatos_esperados: contatosEsp,
      aderencia,
      aberta,
    };
  });
}

export type DistRecorte = {
  distribuicao: MailingDistribuicao[];
  insistencia_pct: number | null;
  /** false = dist incompleta; UI deve avisar / não inventar %. */
  cobertura_completa: boolean;
};

/** Agrega dist do recorte com regra honesta de cobertura. */
export function distDoRecorte(
  mailings: MailingItem[],
  distGlobal: MailingDistribuicao[],
  todas: boolean,
): DistRecorte {
  if (todas) {
    if (distGlobal.length > 0) {
      return {
        distribuicao: distGlobal,
        // Caller deve preferir resumo.insistencia_pct no modo TODAS.
        insistencia_pct: null,
        cobertura_completa: true,
      };
    }
    const dists = mailings.map((m) => m.distribuicao || []).filter((d) => d.length > 0);
    if (!dists.length) {
      return { distribuicao: [], insistencia_pct: null, cobertura_completa: false };
    }
    const completa = dists.length === mailings.filter((m) => m.hoje.tentativas > 0).length;
    const distribuicao = somarDistribuicoes(dists);
    const tent = mailings.reduce((a, m) => a + m.hoje.tentativas, 0);
    return {
      distribuicao,
      insistencia_pct: completa ? insistenciaDeDist(distribuicao, tent) : null,
      cobertura_completa: completa,
    };
  }

  const comVol = mailings.filter((m) => m.hoje.tentativas > 0);
  const dists = comVol.map((m) => m.distribuicao || []).filter((d) => d.length > 0);
  if (!dists.length) {
    return { distribuicao: [], insistencia_pct: null, cobertura_completa: false };
  }
  const completa = dists.length === comVol.length;
  const distribuicao = somarDistribuicoes(dists);
  const tent = completa ? comVol.reduce((a, m) => a + m.hoje.tentativas, 0) : 0;
  return {
    distribuicao: completa ? distribuicao : [],
    insistencia_pct: completa ? insistenciaDeDist(distribuicao, tent) : null,
    cobertura_completa: completa,
  };
}

export function rankingPropensao(mailings: MailingItem[], limite = 8): Array<{
  id: number;
  nome: string;
  campanha_op: string;
  sucesso_1mi: number;
  conv: number;
  tentativas: number;
}> {
  return [...mailings]
    .filter((m) => m.hoje.tentativas >= 500)
    .sort((a, b) => b.propensao.sucesso_100mil - a.propensao.sucesso_100mil)
    .slice(0, limite)
    .map((m) => ({
      id: m.id,
      nome: m.nome_curto,
      campanha_op: m.campanha_op,
      sucesso_1mi: (POR_MILHAO / POR_DISCAGENS) * m.propensao.sucesso_100mil,
      conv: m.hoje.contatos ? m.hoje.sucesso / m.hoje.contatos : 0,
      tentativas: m.hoje.tentativas,
    }));
}

export function campanhasDisponiveis(data: MailingSaude): string[] {
  const vol = new Map<string, number>();
  for (const m of data.mailings) vol.set(m.campanha_op, (vol.get(m.campanha_op) || 0) + m.hoje.tentativas);
  return [...vol.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export function montarVisao(data: MailingSaude, campanha: CampanhaMailing): MailingVisao {
  const todas = campanha === 'TODAS';
  const mailings = todas ? data.mailings : data.mailings.filter((m) => m.campanha_op === campanha);
  const soma = (f: (m: MailingItem) => number) => mailings.reduce((a, m) => a + (f(m) || 0), 0);
  const tentativas = soma((m) => m.hoje.tentativas);
  const phones = soma((m) => m.hoje.phones);
  const alo = soma((m) => m.hoje.alo_robo);
  const contatos = soma((m) => m.hoje.contatos);
  const sucesso = soma((m) => m.hoje.sucesso);
  const disp = soma((m) => m.estoque.disponiveis);
  const prevC = soma((m) => m.previsao_hora.contatos);
  const prevS = soma((m) => m.previsao_hora.sucesso);
  const comDesgaste = mailings.filter((m) => m.hoje.tentativas > 0 && Number.isFinite(m.desgaste?.indice));
  const pesoDesg = comDesgaste.reduce((a, m) => a + m.hoje.tentativas, 0);

  const serie = todas ? data.serie_hora : somarHoras(mailings.map((m) => m.serie_hora));
  const agora = horaAtual(data.updated_at);
  const tend = todas
    ? data.resumo.tendencia
    : tendencia(
        serie
          .filter((h) => Number(h.hora) < agora && h.tentativas > 0)
          .map((h) => [Number(h.hora), h.contatos / h.tentativas, h.tentativas] as [number, number, number]),
      );
  const ids = new Set(mailings.map((m) => m.id));
  const recs = todas
    ? data.recomendacoes
    : data.recomendacoes.filter((r) => {
        if (r.campanha_op) return r.campanha_op === campanha;
        if (r.mailing != null) return ids.has(r.mailing);
        // retentativa / desgaste_dia: visão geral do dia — some no recorte
        return false;
      });

  const dist = distDoRecorte(mailings, data.distribuicao || [], todas);
  const insistencia_pct = todas
    ? data.resumo.insistencia_pct
    : dist.insistencia_pct;

  const sucesso_100mil = tentativas ? (POR_DISCAGENS * sucesso) / tentativas : 0;
  const [pLo, pHi] = wilson(sucesso, tentativas);
  const sucesso_1mi = (POR_MILHAO / POR_DISCAGENS) * sucesso_100mil;
  const sucesso_1mi_ic: [number, number] = [POR_MILHAO * pLo, POR_MILHAO * pHi];
  const comRobo = alo > 0;

  const serieEnriquecida = enriquecerSerieHora(serie, data.updated_at);
  const aderencia_media = aderenciaMedia(serieEnriquecida);

  const por_regiao = agregarLinhasRegiao(
    (data.por_regiao || []).filter((r) => todas || r.campanha_op === campanha),
  );

  const politica_regiao = (data.politica_regiao || [])
    .filter((p) => todas || p.campanha_op === campanha)
    .map((p) => ({
      regiao: p.regiao,
      melhor_hora: p.melhor_hora,
      melhor_taxa: p.melhor_taxa,
      janelas: (p.janelas || []).map((j) => ({
        hora: j.hora,
        tentativas: j.tentativas,
        taxa_contato: j.taxa_contato,
      })),
    }))
    // Se TODAS, pode haver mesma região em várias campanhas — fica a melhor taxa.
    .reduce<MailingVisao['politica_regiao']>((acc, p) => {
      const prev = acc.find((x) => x.regiao === p.regiao);
      if (!prev) acc.push(p);
      else if (p.melhor_taxa > prev.melhor_taxa) {
        Object.assign(prev, p);
      }
      return acc;
    }, [])
    .sort((a, b) => b.melhor_taxa - a.melhor_taxa);

  return {
    mailings,
    tentativas,
    phones,
    alo_robo: alo,
    contatos,
    sucesso,
    giro: phones ? tentativas / phones : 0,
    taxa_alo: tentativas ? alo / tentativas : 0,
    taxa_contato: tentativas ? contatos / tentativas : 0,
    taxa_transferencia: alo ? contatos / alo : 0,
    taxa_sucesso_contato: contatos ? sucesso / contatos : 0,
    sucesso_100mil,
    sucesso_1mi,
    sucesso_1mi_ic,
    disponiveis: disp,
    folego_dias: phones > 0 ? disp / phones : null,
    desgaste_medio: pesoDesg
      ? Math.round(comDesgaste.reduce((a, m) => a + m.desgaste.indice * m.hoje.tentativas, 0) / pesoDesg)
      : null,
    previsao_contatos: prevC,
    previsao_contatos_ic: poisson90(prevC),
    previsao_sucesso: prevS,
    previsao_sucesso_ic: poisson90(prevS),
    tendencia: tend,
    curva: todas ? data.curva : somarCurvas(mailings.map((m) => m.curva)),
    serie_hora: serie,
    recomendacoes: recs,
    distribuicao: dist.distribuicao,
    insistencia_pct,
    dist_cobertura_completa: dist.cobertura_completa,
    funil: funilVendas({ tentativas, alo_robo: alo, contatos, sucesso, comRobo }),
    serie_hora_enriquecida: serieEnriquecida,
    por_regiao,
    aderencia_media,
    politica_regiao,
    health: healthDoRecorte(mailings, todas ? data.resumo?.health : null),
  };
}

function healthDoRecorte(
  mailings: MailingItem[],
  fallback: MailingHealth | null | undefined,
): MailingHealth | null {
  let num = 0;
  let den = 0;
  let pior: MailingItem | null = null;
  for (const m of mailings) {
    const h = m.health;
    const w = m.hoje?.tentativas || 0;
    if (!h || w < 2000) continue;
    num += h.score * w;
    den += w;
    if (!pior || h.score < (pior.health?.score ?? 999)) pior = m;
  }
  if (den <= 0) return fallback ?? null;
  const score = Math.round(num / den);
  const faixa = score < 40 ? 'critico' : score < 70 ? 'atencao' : 'ok';
  return {
    score,
    faixa,
    acao: pior?.health?.acao,
    pior_mailing: pior?.nome_curto,
    pior_id: pior?.id,
  };
}

type LinhaRegiaoIn = {
  regiao: string;
  tentativas: number;
  contatos: number;
  sucesso: number;
  phones?: number;
  pct_virgin?: number;
  pct_saturado?: number;
};

/** Agrega linhas regionais (produto ou lista) → visão por praça com share. */
export function agregarLinhasRegiao(regRows: LinhaRegiaoIn[]): MailingVisao['por_regiao'] {
  const regAcc = new Map<
    string,
    { t: number; c: number; s: number; phones: number; virgin: number; sat: number; hasPen: boolean }
  >();
  for (const r of regRows) {
    const a = regAcc.get(r.regiao) || { t: 0, c: 0, s: 0, phones: 0, virgin: 0, sat: 0, hasPen: false };
    a.t += r.tentativas;
    a.c += r.contatos;
    a.s += r.sucesso;
    if (r.phones != null && r.phones > 0 && r.pct_virgin != null && r.pct_saturado != null) {
      a.hasPen = true;
      a.phones += r.phones;
      a.virgin += r.pct_virgin * r.phones;
      a.sat += r.pct_saturado * r.phones;
    }
    regAcc.set(r.regiao, a);
  }
  const tentReg = [...regAcc.values()].reduce((a, x) => a + x.t, 0);
  return [...regAcc.entries()]
    .map(([regiao, a]) => ({
      regiao,
      tentativas: a.t,
      contatos: a.c,
      sucesso: a.s,
      taxa_contato: a.t ? a.c / a.t : 0,
      sucesso_1mi: a.t ? (POR_MILHAO * a.s) / a.t : 0,
      share_pct: tentReg > 0 ? a.t / tentReg : 0,
      phones: a.hasPen ? a.phones : undefined,
      pct_virgin: a.hasPen && a.phones > 0 ? a.virgin / a.phones : null,
      pct_saturado: a.hasPen && a.phones > 0 ? a.sat / a.phones : null,
    }))
    .sort((a, b) => b.tentativas - a.tentativas);
}

/** Drill lista→praça a partir de por_regiao_mailing. */
export function regioesDoMailing(data: MailingSaude, idMailing: number): MailingVisao['por_regiao'] {
  const rows = (data.por_regiao_mailing || []).filter((r) => r.id_mailing === idMailing);
  return agregarLinhasRegiao(rows);
}

/** % virgin de estoque (lista ainda não tocada). */
export function pctVirginEstoque(m: MailingItem): number | null {
  const clientes = m.estoque?.clientes ?? 0;
  const virgens = m.estoque?.virgens ?? 0;
  if (clientes <= 0) return null;
  return virgens / clientes;
}

/** % esgotado = (finalizados+bloqueados)/clientes — mesmo componente do desgaste. */
export function pctEsgotadoEstoque(m: MailingItem): number | null {
  const comp = m.desgaste?.componentes?.esgotado;
  if (comp != null && Number.isFinite(comp)) return Math.min(1, Math.max(0, comp));
  return null;
}

/** Média ponderada por tentativas das aderências das horas fechadas. */
export function aderenciaMedia(serie: MailingHoraEnriquecida[]): number | null {
  let wt = 0;
  let acc = 0;
  for (const h of serie) {
    if (h.aberta || h.aderencia == null || h.tentativas <= 0) continue;
    wt += h.tentativas;
    acc += h.aderencia * h.tentativas;
  }
  return wt > 0 ? acc / wt : null;
}

export const STATUS_DESGASTE: Record<string, { label: string; cls: string }> = {
  saudavel: { label: 'Saudável', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  atencao: { label: 'Atenção', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  desgastado: { label: 'Desgastado', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  esgotando: { label: 'Esgotando', cls: 'bg-red-50 text-red-700 border-red-200' },
};

export function statusDesgaste(status?: string) {
  return STATUS_DESGASTE[status || ''] || { label: status || '—', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
}

export function fmtPct(x: number, casas = 2): string {
  if (!Number.isFinite(x)) return '—';
  return `${(100 * x).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function fmtNum(x: number | null | undefined, casas = 0): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Retentativa: a 2ª discagem contata mais que a 1ª (o discador volta em quem deu sinal de vida). */
export function ganhoRetentativa(curva: MailingCurvaPonto[]): number | null {
  if (curva.length < 2 || curva[0].taxa <= 0 || curva[1].em_risco < 300) return null;
  return curva[1].taxa / curva[0].taxa;
}
