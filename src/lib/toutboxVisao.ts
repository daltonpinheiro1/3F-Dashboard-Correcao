/** Base da eficiência: o que saiu para a Toutbox. eSIM e sem pacote ficam de fora. */

export type ToutboxContagem = {
  tbx_n?: number;
  tbx_entregue?: number;
  tbx_em_rota?: number;
  tbx_insucesso?: number;
};

export function enviadosTbx(row: ToutboxContagem): number {
  return (row.tbx_entregue || 0) + (row.tbx_em_rota || 0) + (row.tbx_insucesso || 0);
}

export function pctTbx(parte: number, enviados: number): number {
  return enviados > 0 ? Math.round((1000 * parte) / enviados) / 10 : 0;
}

/** Roboadm recadastra proposta de outra pessoa. Não entra no ranking. */
export function ehVendedorRobo(nome: string | null | undefined): boolean {
  return /^roboadm\d*$/i.test(String(nome || '').trim());
}
