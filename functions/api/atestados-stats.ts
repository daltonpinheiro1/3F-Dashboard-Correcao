/**
 * GET /api/atestados-stats — contagens leves para badge sidebar e KPIs.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const TABLE = 'atestados';
const hits = new Map<string, number[]>();

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const [pend, analise, inss, smbPending] = await Promise.all([
      sbFetch(
        context.env,
        `/rest/v1/${TABLE}?select=id&status=eq.protocolado&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
      sbFetch(
        context.env,
        `/rest/v1/${TABLE}?select=id&status=eq.em_analise&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
      sbFetch(
        context.env,
        `/rest/v1/${TABLE}?select=id&unidade_periodo=eq.dias&quantidade_dias=gt.15&status=in.(protocolado,em_analise,aprovado)&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
      sbFetch(
        context.env,
        // Alinha com isAtestadoSmbPending: precisa ter arquivo_path + cloud path, sem sync SMB.
        `/rest/v1/${TABLE}?select=id&arquivo_path=not.is.null&arquivo_cloud_archive_path=not.is.null&arquivo_smb_synced_at=is.null&limit=1`,
        { headers: { Prefer: 'count=exact' } },
      ),
    ]);

    const countFrom = (r: Response) => {
      const h = r.headers.get('content-range') || '';
      const m = h.match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    };

    const protocolados = countFrom(pend);
    const em_analise = countFrom(analise);
    const inss_alertas = countFrom(inss);
    const smb_pendentes = countFrom(smbPending);

    return json({
      pendentes: protocolados + em_analise,
      protocolados,
      em_analise,
      inss_alertas,
      smb_pendentes,
    });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
