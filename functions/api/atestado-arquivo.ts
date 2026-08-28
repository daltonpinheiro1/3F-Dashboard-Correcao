/**
 * GET /api/atestado-arquivo?id=...
 * Retorna URL assinada (curta) para visualizar o arquivo no bucket privado.
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
import { ATESTADOS_BUCKET } from '../_lib/atestadosStorage';

const TABLE = 'atestados';
const hits = new Map<string, number[]>();
const EXPIRES_SEC = 600;

async function getRow(env: EnvAuth, id: string): Promise<Record<string, unknown> | null> {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!r.ok) return null;
  const rows = (await r.json()) as Record<string, unknown>[];
  return rows[0] || null;
}

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const row = await getRow(context.env, id);
  if (!row) return json({ error: 'Atestado não encontrado.' }, 404);

  const path = String(row.arquivo_path || '').trim();
  if (!path) return json({ error: 'Sem arquivo anexado.' }, 404);

  const sign = await sbFetch(
    context.env,
    `/storage/v1/object/sign/${ATESTADOS_BUCKET}/${path}`,
    {
      method: 'POST',
      body: JSON.stringify({ expiresIn: EXPIRES_SEC }),
    },
  );
  if (!sign.ok) {
    const t = await sign.text();
    return json({ error: `Falha ao assinar URL: ${sign.status}`, detalhe: t.slice(0, 200) }, 502);
  }
  const data = (await sign.json()) as { signedURL?: string };
  const signed = data.signedURL;
  if (!signed) return json({ error: 'URL assinada ausente.' }, 502);

  const cfg = sbConfig(context.env);
  const url = cfg ? `${cfg.url}/storage/v1${signed}` : signed;

  return json({
    url,
    expires_in: EXPIRES_SEC,
    mime: row.arquivo_mime || 'application/octet-stream',
    nome: row.arquivo_nome_original || path.split('/').pop(),
  });
}
