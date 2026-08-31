import { dashboardSessionHeaders, hasDashboardSession } from './dashboardSession';
import { acksDoRecorte, upsertAckLocal, type RrAck } from './rrAcks';

type AckPayload = { acks?: RrAck[]; persist?: boolean; error?: string };

function mapRow(r: Record<string, unknown>): RrAck {
  return {
    alertId: String(r.alertId || r.alert_id || ''),
    dataRef: String(r.dataRef || r.data_ref || '').slice(0, 10),
    campanha: String(r.campanha || ''),
    ownerEmail: String(r.ownerEmail || r.owner_email || ''),
    ownerName: String(r.ownerName || r.owner_name || ''),
    ackedAt: String(r.ackedAt || r.acked_at || ''),
    slaUntil: String(r.slaUntil || r.sla_until || ''),
  };
}

export async function fetchRrAcks(dataRef: string, campanha: string): Promise<RrAck[]> {
  if (!hasDashboardSession()) return acksDoRecorte(dataRef, campanha);
  try {
    const r = await fetch(
      `/api/rr-alert-ack?dataRef=${encodeURIComponent(dataRef)}&campanha=${encodeURIComponent(campanha)}`,
      { headers: dashboardSessionHeaders() },
    );
    const body = (await r.json()) as AckPayload;
    if (r.ok && Array.isArray(body.acks)) {
      for (const raw of body.acks) {
        const a = mapRow(raw as unknown as Record<string, unknown>);
        if (a.alertId) upsertAckLocal(a);
      }
    }
  } catch {
    /* localStorage cobre host sem Function / migration */
  }
  return acksDoRecorte(dataRef, campanha);
}

export async function postRrAck(ack: RrAck): Promise<void> {
  upsertAckLocal(ack);
  if (!hasDashboardSession()) return;
  try {
    await fetch('/api/rr-alert-ack', {
      method: 'POST',
      headers: dashboardSessionHeaders(),
      body: JSON.stringify({
        dataRef: ack.dataRef,
        campanha: ack.campanha,
        alertId: ack.alertId,
        slaUntil: ack.slaUntil,
      }),
    });
  } catch {
    /* ack local já gravado */
  }
}
