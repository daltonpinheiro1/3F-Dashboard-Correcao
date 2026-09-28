import { dataBrtIso, mesBrt } from './brt';
import { escalaCritica, type Advertencia } from './advertenciasEscala';
import { gestorDaAdvertencia } from './advertenciasGestor';
import { matchDpInbox, type DpInboxFiltro } from './advertenciasDpInbox';
import { isMinhaSolicitacao } from './advertenciasNotificacao';
import { kpisAdvertencias, type AdvertenciasRecorte } from './advertenciasService';

export type AdvertenciasFiltrosUi = {
  inbox: DpInboxFiltro;
  minhas: boolean;
  status: string;
  colab: string;
  nivel: string;
  criticos: boolean;
  de: string;
  ate: string;
};

/** Facetas que viram chip/contador: excluídas da base para o número bater com o clique. */
export type FacetaAdvertencia = 'inbox' | 'minhas';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const FILTRO_COLAB_MAX = 80;

/** Mesma limpeza do servidor (functions/_lib/advertenciasList sanitizeFiltroTexto). */
export function normalizarBuscaColaborador(raw: string): string {
  return raw
    .slice(0, FILTRO_COLAB_MAX)
    .trim()
    .replace(/[*%(),"\\]/g, '')
    .replace(/\s+/g, ' ');
}

/** Campo a campo, como o `or(...ilike...)` do servidor. */
export function colaboradorCasa(r: Advertencia, busca: string): boolean {
  const q = normalizarBuscaColaborador(busca).toLowerCase();
  if (!q) return true;
  return [r.colaborador_nome, r.colaborador_matricula, gestorDaAdvertencia(r), r.criado_por_nome].some((v) =>
    String(v || '').toLowerCase().includes(q),
  );
}

export function matchAdvertenciaFiltros(
  r: Advertencia,
  f: AdvertenciasFiltrosUi,
  userEmail: string,
  excluir: readonly FacetaAdvertencia[] = [],
): boolean {
  if (!excluir.includes('inbox') && !matchDpInbox(r, f.inbox)) return false;
  if (!excluir.includes('minhas') && f.minhas && !isMinhaSolicitacao(r, userEmail)) return false;
  if (f.status && r.status !== f.status) return false;
  if (f.criticos && !escalaCritica(r.nivel_idx)) return false;
  if (!f.criticos && f.nivel !== '' && String(r.nivel_idx) !== f.nivel) return false;
  if (f.colab && !colaboradorCasa(r, f.colab)) return false;
  if (f.de && r.data_ocorrido < f.de) return false;
  if (f.ate && r.data_ocorrido > f.ate) return false;
  return true;
}

export function filtrarAdvertencias(
  rows: Advertencia[],
  f: AdvertenciasFiltrosUi,
  userEmail: string,
  excluir: readonly FacetaAdvertencia[] = [],
): Advertencia[] {
  return rows.filter((r) => matchAdvertenciaFiltros(r, f, userEmail, excluir));
}

/** Contador de cada fila = base com todos os filtros exceto a própria fila. */
export function contarInboxFaceted(
  rows: Advertencia[],
  f: AdvertenciasFiltrosUi,
  userEmail: string,
): Record<DpInboxFiltro, number> {
  const base = filtrarAdvertencias(rows, f, userEmail, ['inbox']);
  const conta = (fila: DpInboxFiltro) => base.filter((r) => matchDpInbox(r, fila)).length;
  return {
    todas: base.length,
    enviadas: conta('enviadas'),
    autorizadas: conta('autorizadas'),
    recusadas: conta('recusadas'),
    recebidas: conta('recebidas'),
  };
}

function fmtDia(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function rotuloPeriodoAdvertencias(de: string, ate: string, agora: Date = new Date()): string {
  if (de && ate) return `no período ${fmtDia(de)} a ${fmtDia(ate)}`;
  if (de) return `desde ${fmtDia(de)}`;
  if (ate) return `até ${fmtDia(ate)}`;
  const [y, m] = mesBrt(agora).split('-');
  return `no mês corrente (${m}/${y})`;
}

/**
 * KPIs sobre as linhas já filtradas. Com período, conta por data do ocorrido dentro dele;
 * sem período, mantém a regra do mês corrente (created_at, BRT).
 */
export function kpisAdvertenciasRecorte(
  rows: Advertencia[],
  periodo: { de: string; ate: string },
  agora: Date = new Date(),
) {
  const base = kpisAdvertencias(rows);
  const temPeriodo = Boolean(periodo.de || periodo.ate);
  const mesYm = mesBrt(agora);
  const noPeriodo = rows.filter((r) => {
    if (temPeriodo) {
      const dia = String(r.data_ocorrido || '').slice(0, 10);
      if (!ISO_DAY.test(dia)) return false;
      if (periodo.de && dia < periodo.de) return false;
      if (periodo.ate && dia > periodo.ate) return false;
      return true;
    }
    const raw = r.created_at || r.data_ocorrido;
    if (!raw) return false;
    if (ISO_DAY.test(raw)) return raw.slice(0, 7) === mesYm;
    const t = Date.parse(raw);
    return Number.isFinite(t) && dataBrtIso(new Date(t)).slice(0, 7) === mesYm;
  }).length;
  return {
    pendentes: base.pendentes,
    suspensoesAtivas: base.suspensoesAtivas,
    criticos: base.criticos,
    noPeriodo,
    periodoLabel: rotuloPeriodoAdvertencias(periodo.de, periodo.ate, agora),
  };
}

/** Parte dos filtros que o servidor aplica (inbox e "minhas" ficam no navegador). */
export function recorteServidorAdvertencias(
  f: Pick<AdvertenciasFiltrosUi, 'status' | 'colab' | 'nivel' | 'criticos' | 'de' | 'ate'>,
): AdvertenciasRecorte {
  const de = ISO_DAY.test(f.de) ? f.de : '';
  const ate = ISO_DAY.test(f.ate) ? f.ate : '';
  const periodoOk = !(de && ate && de > ate);
  const colab = normalizarBuscaColaborador(f.colab);
  return {
    status: f.status || null,
    de: periodoOk && de ? de : null,
    ate: periodoOk && ate ? ate : null,
    colaborador: colab.length >= 2 ? colab : null,
    nivel: !f.criticos && /^\d{1,2}$/.test(f.nivel) ? f.nivel : null,
    criticos: f.criticos,
  };
}

export function temRecorteServidor(r: AdvertenciasRecorte): boolean {
  return Boolean(r.status || r.de || r.ate || r.colaborador || r.nivel || r.criticos);
}
