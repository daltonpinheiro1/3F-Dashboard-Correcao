export type RrAck = {
  alertId: string;
  dataRef: string;
  campanha: string;
  ownerEmail: string;
  ownerName: string;
  ackedAt: string;
  slaUntil: string;
};

export const SLA_MIN: Record<'critico' | 'alto', number> = { critico: 30, alto: 60 };

const LS_KEY = '3f-rr-acks-v1';

export function alertStableId(dataRef: string, campanha: string, alertId: string) {
  return `${dataRef}|${campanha}|${alertId}`;
}

export function slaStatus(ack: RrAck | undefined, now = Date.now()): 'aberto' | 'no_prazo' | 'vencido' {
  if (!ack) return 'aberto';
  return Date.parse(ack.slaUntil) < now ? 'vencido' : 'no_prazo';
}

export function slaRestanteMin(ack: RrAck, now = Date.now()): number {
  return Math.max(0, Math.round((Date.parse(ack.slaUntil) - now) / 60_000));
}

function readLocal(): RrAck[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as RrAck[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: RrAck[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-200)));
}

export function acksDoRecorte(dataRef: string, campanha: string): RrAck[] {
  return readLocal().filter((a) => a.dataRef === dataRef && a.campanha === campanha);
}

export function upsertAckLocal(ack: RrAck) {
  const rest = readLocal().filter(
    (a) => !(a.dataRef === ack.dataRef && a.campanha === ack.campanha && a.alertId === ack.alertId),
  );
  writeLocal([...rest, ack]);
}

export function buildAck(opts: {
  alertId: string;
  dataRef: string;
  campanha: string;
  ownerEmail: string;
  ownerName: string;
  slaMin: number;
  now?: Date;
}): RrAck {
  const now = opts.now || new Date();
  return {
    alertId: opts.alertId,
    dataRef: opts.dataRef,
    campanha: opts.campanha,
    ownerEmail: opts.ownerEmail,
    ownerName: opts.ownerName,
    ackedAt: now.toISOString(),
    slaUntil: new Date(now.getTime() + opts.slaMin * 60_000).toISOString(),
  };
}
