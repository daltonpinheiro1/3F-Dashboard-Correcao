/**
 * POST /api/atestado-thumb?id=...
 * Regenera miniatura na nuvem a partir de JPEG base64.
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
import { writeAtestadoAudit } from '../_lib/atestadosAudit';
import {
  ATESTADOS_BUCKET,
  buildAtestadoThumbStoragePath,
  decodeImageBase64,
} from '../_lib/atestadosStorage';

const TABLE = 'atestados';
const hits = new Map<string, number[]>();

async function getRow(env: EnvAuth, id: string): Promise<Record<string, unknown> | null> {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!r.ok) return null;
  const rows = (await r.json()) as Record<string, unknown>[];
  return rows[0] || null;
}

async function uploadThumb(env: EnvAuth, path: string, bytes: Uint8Array): Promise<boolean> {
  const r = await sbFetch(env, `/storage/v1/object/${ATESTADOS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  return r.ok;
}

export async function onRequestPost(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  let payload: { imagem_thumb_base64?: string };
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const row = await getRow(context.env, id);
  if (!row) return json({ error: 'Atestado não encontrado.' }, 404);

  const arquivoPath = String(row.arquivo_path || '').trim();
  if (!arquivoPath) return json({ error: 'Sem arquivo associado.' }, 400);
  if (String(row.arquivo_mime || '') === 'application/pdf') {
    return json({ error: 'PDF não possui miniatura.' }, 400);
  }

  const thumbRaw = String(payload.imagem_thumb_base64 || '').trim();
  const decoded = decodeImageBase64(thumbRaw);
  if (!decoded.ok) return json({ error: decoded.error }, 400);

  const thumbPath =
    String(row.arquivo_thumb_path || '').trim() || buildAtestadoThumbStoragePath(arquivoPath);
  const ok = await uploadThumb(context.env, thumbPath, decoded.bytes);
  if (!ok) return json({ error: 'Falha ao gravar miniatura.' }, 502);

  const patchR = await sbFetch(
    context.env,
    `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ arquivo_thumb_path: thumbPath, updated_at: new Date().toISOString() }),
    },
  );
  if (!patchR.ok) return json({ error: 'Falha ao atualizar registro.' }, 502);
  const updated = ((await patchR.json()) as Record<string, unknown>[])[0];

  await writeAtestadoAudit(context.env, {
    atestado_id: id,
    action: 'thumb_regenerado',
    actor_email: auth.user?.email,
    actor_nome: auth.user?.full_name,
    payload: { arquivo_thumb_path: thumbPath },
  });

  return json({ row: updated, ok: true });
}
