/** Alerta INSS: atestado isolado > 15 dias ou soma por colaborador + CID-raiz com recorrência em 60 dias. */

import { diasEfetivos, INSS_DIAS_LIMIAR, resolverFim, type PeriodoRef } from './atestadosDuplicidade';

export const INSS_JANELA_RECORRENCIA_DIAS = 60;

const DIA_MS = 86_400_000;

export type InssRef = PeriodoRef & {
  status?: string | null;
  cid?: string | null;
  colaborador_matricula?: string | null;
  colaborador_nome?: string | null;
};

export type AlertaInss<T> = {
  chave: string;
  cid_raiz: string;
  tipo: 'isolado' | 'acumulado';
  atestados: T[];
  dias_acumulados: number;
  inicio: string | null;
  fim: string | null;
  /** 16º dia acumulado de afastamento (início do prazo de encaminhamento). */
  dia16: string | null;
};

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(`${s.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

function isoDe(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString().slice(0, 10);
}

export function cidRaiz(cid: string | null | undefined): string {
  return String(cid || '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 3);
}

export function nomeColaboradorNormalizado(nome: string | null | undefined): string {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function chaveColaboradorInss(r: {
  colaborador_matricula?: string | null;
  colaborador_nome?: string | null;
}): string {
  const mat = String(r.colaborador_matricula || '').trim();
  if (mat) return `mat:${mat}`;
  const nome = nomeColaboradorNormalizado(r.colaborador_nome);
  return nome ? `nome:${nome}` : '';
}

export function elegivelInss(r: InssRef): boolean {
  if (['recusado', 'cancelada'].includes(String(r.status || ''))) return false;
  return r.unidade_periodo !== 'horas';
}

function alertaIsolado<T extends InssRef>(r: T, chave: string, raiz: string): AlertaInss<T> {
  const ini = parseDate(r.data_inicio);
  return {
    chave,
    cid_raiz: raiz,
    tipo: 'isolado',
    atestados: [r],
    dias_acumulados: diasEfetivos(r),
    inicio: isoDe(ini),
    fim: isoDe(resolverFim(r)),
    dia16: isoDe(ini == null ? null : ini + INSS_DIAS_LIMIAR * DIA_MS),
  };
}

function cadeiasDoGrupo<T extends InssRef>(lista: T[], chave: string, raiz: string): AlertaInss<T>[] {
  const ordenada = [...lista].sort(
    (a, b) => (parseDate(a.data_inicio) ?? 0) - (parseDate(b.data_inicio) ?? 0),
  );
  const out: AlertaInss<T>[] = [];
  let cadeia: T[] = [];
  let iniCadeia = 0;
  let fimMax = 0;
  let acc = 0;
  let dia16: number | null = null;

  const fechar = () => {
    if (cadeia.length && acc > INSS_DIAS_LIMIAR) {
      out.push({
        chave,
        cid_raiz: raiz,
        tipo: cadeia.length > 1 ? 'acumulado' : 'isolado',
        atestados: cadeia,
        dias_acumulados: acc,
        inicio: isoDe(iniCadeia),
        fim: isoDe(fimMax),
        dia16: isoDe(dia16),
      });
    }
    cadeia = [];
    acc = 0;
    dia16 = null;
  };

  for (const r of ordenada) {
    const ini = parseDate(r.data_inicio)!;
    const fim = Math.max(resolverFim(r) ?? ini, ini);
    if (cadeia.length && ini - fimMax > INSS_JANELA_RECORRENCIA_DIAS * DIA_MS) fechar();
    if (!cadeia.length) {
      iniCadeia = ini;
      fimMax = ini - DIA_MS;
    }
    const desde = Math.max(ini, fimMax + DIA_MS);
    const novos = fim >= desde ? Math.round((fim - desde) / DIA_MS) + 1 : 0;
    if (dia16 == null && acc + novos > INSS_DIAS_LIMIAR) {
      dia16 = desde + (INSS_DIAS_LIMIAR - acc) * DIA_MS;
    }
    acc += novos;
    fimMax = Math.max(fimMax, fim);
    cadeia.push(r);
  }
  fechar();
  return out;
}

/**
 * Agrupa atestados elegíveis (não recusados, em dias) por colaborador (matrícula, senão nome
 * normalizado) e CID-raiz; dias sobrepostos contam uma vez. Sem CID ou sem data de início,
 * só vale o alerta isolado.
 */
export function agruparAlertasInss<T extends InssRef>(rows: T[]): AlertaInss<T>[] {
  const alertas: AlertaInss<T>[] = [];
  const grupos = new Map<string, { chave: string; raiz: string; lista: T[] }>();
  for (const r of rows) {
    if (!elegivelInss(r)) continue;
    const chave = chaveColaboradorInss(r);
    const raiz = cidRaiz(r.cid);
    if (parseDate(r.data_inicio) == null || !chave || !raiz) {
      if (diasEfetivos(r) > INSS_DIAS_LIMIAR) alertas.push(alertaIsolado(r, chave, raiz));
      continue;
    }
    const k = `${chave}|${raiz}`;
    const g = grupos.get(k) || { chave, raiz, lista: [] };
    g.lista.push(r);
    grupos.set(k, g);
  }
  for (const g of grupos.values()) alertas.push(...cadeiasDoGrupo(g.lista, g.chave, g.raiz));
  return alertas.sort((a, b) => (a.dia16 || '9999').localeCompare(b.dia16 || '9999'));
}
