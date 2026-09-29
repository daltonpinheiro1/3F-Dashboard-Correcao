import { brtParts } from './brt';

/** Mesma janela do vm-orchestrator: seg–sex 09–21h, sábado 09–16h, domingo sem sync ao vivo. */
export const JANELA_SYNC_TEXTO = 'seg–sex 09h–21h, sáb 09h–16h';

export function janelaSyncAberta(d: Date = new Date()): boolean {
  const p = brtParts(d);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.day)).getUTCDay();
  if (dow === 0) return false;
  const fim = dow === 6 ? 16 : 21;
  return p.h >= 9 && p.h < fim;
}

/** Texto de quando o sync volta, visto de fora da janela. */
export function proximaJanelaSync(d: Date = new Date()): string {
  const p = brtParts(d);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.day)).getUTCDay();
  if (dow !== 0 && p.h < 9) return 'hoje às 09h';
  if (dow === 6 || dow === 0) return 'segunda às 09h';
  return 'amanhã às 09h';
}
