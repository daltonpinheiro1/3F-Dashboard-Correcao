import { shiftIsoDay } from './brt';

/** Teto do /api/portabilidade-matrix. */
export const MATRIX_MAX_DIAS = 30;

export type JanelaMatrix = {
  dias: number;
  /** Âncora enviada ao endpoint (último dia do mês passado); null = termina agora. */
  ate: string | null;
  de: string;
  fim: string;
  /** Dias do mês que ficaram fora pelo teto de 30. */
  diasFora: number;
  label: string;
};

function diasNoMes(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Janela da decision matrix para o mês `YYYY-MM` do filtro de Disparos. */
export function janelaMatrixDoMes(mes: string, hojeIso: string): JanelaMatrix {
  const hoje = hojeIso.slice(0, 10);
  const mesHoje = hoje.slice(0, 7);
  const valido = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const passado = valido && mes < mesHoje;
  const mesRef = passado ? mes : mesHoje;
  const fim = passado ? `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}` : hoje;
  const cobrir = Number(fim.slice(8, 10));
  const dias = Math.min(MATRIX_MAX_DIAS, Math.max(1, cobrir));
  const de = shiftIsoDay(fim, -(dias - 1));
  const diasFora = cobrir - dias;
  const fora = diasFora > 0 ? ` · teto de ${MATRIX_MAX_DIAS} dias: ${mesRef}-01 fora` : '';
  return {
    dias,
    ate: passado ? fim : null,
    de,
    fim,
    diasFora,
    label: `Matriz ${de} → ${fim} (${dias} dia${dias === 1 ? '' : 's'})${passado ? '' : ' · até agora'}${fora}`,
  };
}

export function urlMatrixDoMes(j: Pick<JanelaMatrix, 'dias' | 'ate'>): string {
  const qs = new URLSearchParams({ dias: String(j.dias) });
  if (j.ate) qs.set('ate', j.ate);
  return `/api/portabilidade-matrix?${qs}`;
}
