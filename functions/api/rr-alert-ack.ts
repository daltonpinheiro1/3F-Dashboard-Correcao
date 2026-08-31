/**
 * GET /api/rr-alert-ack?dataRef=&campanha=
 * POST { dataRef, campanha, alertId, slaUntil? | slaMin? }
 * Ack + SLA do exception board RR. Tabela service_role (migration 029).
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbConfig,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const hits = new Map<string, number[]>();
type Env = EnvAuth;

const CAMPANHAS = new Set(['TODAS', 'PORTABILIDADE', 'MIGRACAO', 'ACAO_BKO']);
const ALERT_ID = /^[a-z0-9_]{2,40}$/;

function tableMissing(msg: string) {
  return /PGRST205|Could not find the table|rr_alert_acks/i.test(msg);
}

function toAck(r: Record<string, unknown>) {
  return {
    alertId: r.alert_id,
    dataRef: r.data_ref,
    campanha: r.campanha,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    ackedAt: r.acked_at,
    slaUntil: r.sla_until,
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 40)) return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!sbConfig(context.env)) return json({ error: 'Supabase service ausente no Pages.' }, 503);

  const url = new URL(context.request.url);
  const dataRef = (url.searchParams.get('dataRef') || '').slice(0, 10);
  const campanha = (url.searchParams.get('campanha') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef) || !CAMPANHAS.has(campanha)) {
    return json({ error: 'dataRef e campanha obrigatórios.' }, 400);
  }

  const path =
    `/rest/v1/rr_alert_acks?select=alert_id,data_ref,campanha,owner_email,owner_name,acked_at,sla_until` +
    `&data_ref=eq.${dataRef}&campanha=eq.${encodeURIComponent(campanha)}`;

  try {
    const r = await sbFetch(context.env, path);
    const text = await r.text();
    if (!r.ok) {
      if (tableMissing(text)) return json({ acks: [], persist: false });
      return json({ error: `PostgREST ${r.status}` }, 502);
    }
    const rows = (text ? JSON.parse(text) : []) as Record<string, unknown>[];
    return json({ acks: Array.isArray(rows) ? rows.map(toAck) : [], persist: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 20)) return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!sbConfig(context.env)) return json({ error: 'Supabase service ausente no Pages.' }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const dataRef = String(body.dataRef || '').slice(0, 10);
  const campanha = String(body.campanha || '').trim();
  const alertId = String(body.alertId || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef) || !CAMPANHAS.has(campanha) || !ALERT_ID.test(alertId)) {
    return json({ error: 'dataRef, campanha ou alertId inválido.' }, 400);
  }

  const slaMinRaw = Number(body.slaMin);
  const slaMin = slaMinRaw === 30 || slaMinRaw === 60 ? slaMinRaw : 60;
  const slaUntil =
    typeof body.slaUntil === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(body.slaUntil)
      ? body.slaUntil
      : new Date(Date.now() + slaMin * 60_000).toISOString();

  const ownerEmail =
    auth.ok && auth.mode === 'session' ? auth.user?.email || 'admin' : 'sistema@3f';
  const ownerName =
    auth.ok && auth.mode === 'session'
      ? auth.user?.full_name || auth.user?.email || 'Admin'
      : 'Sistema';

  const row = {
    data_ref: dataRef,
    campanha,
    alert_id: alertId,
    owner_email: ownerEmail,
    owner_name: ownerName,
    acked_at: new Date().toISOString(),
    sla_until: slaUntil,
  };

  try {
    const r = await sbFetch(context.env, '/rest/v1/rr_alert_acks?on_conflict=data_ref,campanha,alert_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    });
    const text = await r.text();
    if (!r.ok) {
      if (tableMissing(text)) {
        return json({ ack: toAck(row), persist: false });
      }
      return json({ error: `PostgREST ${r.status}`, detalhe: text.slice(0, 180) }, 502);
    }
    const saved = (text ? JSON.parse(text) : [row]) as Record<string, unknown>[];
    const first = Array.isArray(saved) && saved[0] ? saved[0] : row;
    return json({ ack: toAck(first), persist: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
}
