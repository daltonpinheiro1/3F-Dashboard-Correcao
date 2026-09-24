import type {
  MailingCurvaPonto,
  MailingHora,
  MailingItem,
  MailingRecomendacao,
  MailingSaude,
  MailingTendencia,
} from '../../shared/contracts/mailing';

export type CampanhaMailing = 'TODAS' | string;

export const POR_DISCAGENS = 100_000;
export const FOLEGO_ALERTA_DIAS = 1.5;

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
  sucesso_100mil: number;
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
    sucesso_100mil: tentativas ? (POR_DISCAGENS * sucesso) / tentativas : 0,
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
  };
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
