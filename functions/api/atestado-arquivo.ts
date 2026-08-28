/**
 * GET /api/atestado-arquivo?id=...
 * Retorna URL assinada do thumbnail no Supabase (preview).
 * Arquivo completo fica no SMB — ver smb_unc na resposta.
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
import { toSmbUncPath } from '../_lib/atestadosSmbPaths';

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

  const arquivoPath = String(row.arquivo_path || '').trim();
  const thumbPath = String(row.arquivo_thumb_path || '').trim();
  const smbUnc = arquivoPath ? toSmbUncPath(arquivoPath) : null;
  const mime = String(row.arquivo_mime || 'application/octet-stream');
  const isPdf = mime === 'application/pdf';

  const storagePath = thumbPath || (!isPdf ? arquivoPath : '');

  if (!storagePath) {
    return json({
      preview_unavailable: true,
      smb_unc: smbUnc,
      mime,
      nome: row.arquivo_nome_original || arquivoPath.split('/').pop(),
      message: isPdf
        ? 'PDF arquivado na rede corporativa. Use o caminho SMB abaixo.'
        : 'Sem preview na nuvem.',
    });
  }

  const sign = await sbFetch(
    context.env,
    `/storage/v1/object/sign/${ATESTADOS_BUCKET}/${storagePath}`,
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
    mime: thumbPath ? 'image/jpeg' : mime,
    nome: row.arquivo_nome_original || storagePath.split('/').pop(),
    is_thumbnail: Boolean(thumbPath),
    smb_unc: smbUnc,
    preview_unavailable: false,
  });
}
