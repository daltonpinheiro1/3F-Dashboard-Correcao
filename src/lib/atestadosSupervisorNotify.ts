import type { Atestado } from './atestadosEscala';
import { STATUS_LABELS } from './atestadosEscala';

const STORAGE_KEY = '3f_atestados_supervisor_seen';

function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSeen(map: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/** Notifica supervisor quando status de solicitação muda (browser Notification). */
export function processarNotificacoesSupervisor(
  rows: Atestado[],
  userEmail: string,
): Atestado[] {
  const mine = rows.filter((r) => r.criado_por_email === userEmail && r.origem === 'supervisor');
  const seen = loadSeen();
  const novos: Atestado[] = [];

  for (const r of mine) {
    const prev = seen[r.id];
    const cur = `${r.status}|${r.updated_at}`;
    if (prev && prev !== cur && (r.status === 'aprovado' || r.status === 'recusado')) {
      novos.push(r);
    }
    seen[r.id] = cur;
  }
  saveSeen(seen);

  if (novos.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    for (const r of novos.slice(0, 3)) {
      new Notification(`Atestado ${r.protocolo}`, {
        body: `${STATUS_LABELS[r.status]} — ${r.colaborador_nome}`,
        tag: r.id,
      });
    }
  }
  return novos;
}

export async function solicitarPermissaoNotificacao(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}
