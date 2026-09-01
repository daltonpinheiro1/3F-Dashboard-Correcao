/**
 * GET /api/atestado-arquivo?id=...
 * Preview: thumb na nuvem; arquivo completo na rede ou archive na nuvem se pendente.
 * Admin vê qualquer; supervisor/viewer só as próprias solicitações (criado_por_email).
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  isAtestadoAdmin,
  json,
  requireAtestadoRead,
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

async function signPath(env: EnvAuth, objectPath: string): Promise<string | null> {
  const sign = await sbFetch(
    env,
    `/storage/v1/object/sign/${ATESTADOS_BUCKET}/${objectPath}`,
    {
      method: 'POST',
      body: JSON.stringify({ expiresIn: EXPIRES_SEC }),
    },
  );
  if (!sign.ok) return null;
  const data = (await sign.json()) as { signedURL?: string };
  const signed = data.signedURL;
  if (!signed) return null;
  const cfg = sbConfig(env);
  return cfg ? `${cfg.url}/storage/v1${signed}` : signed;
}

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAtestadoRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const row = await getRow(context.env, id);
  if (!row) return json({ error: 'Atestado não encontrado.' }, 404);

  if (!isAtestadoAdmin(auth) && auth.mode === 'session') {
    const owner = String(row.criado_por_email || '').trim().toLowerCase();
    const me = String(auth.user?.email || '').trim().toLowerCase();
    if (!me || owner !== me) {
      return json({ error: 'Sem permissão para este arquivo.' }, 403);
    }
  }

  const arquivoPath = String(row.arquivo_path || '').trim();
  const thumbPath = String(row.arquivo_thumb_path || '').trim();
  const archivePath = String(row.arquivo_cloud_archive_path || '').trim();
  const smbSynced = Boolean(row.arquivo_smb_synced_at);
  const smbPending = Boolean(archivePath && !smbSynced);
  const smbUnc = arquivoPath ? toSmbUncPath(arquivoPath) : null;
  const mime = String(row.arquivo_mime || 'application/octet-stream');
  const isPdf = mime === 'application/pdf';

  // PDF: prioriza archive (nuvem) para abrir/imprimir; imagem: thumb → archive → arquivo
  const previewPath = isPdf ? archivePath || '' : thumbPath || archivePath || arquivoPath;
  const url = previewPath ? await signPath(context.env, previewPath) : null;
  let archiveUrl: string | null = null;
  if (archivePath) {
    archiveUrl = previewPath === archivePath ? url : await signPath(context.env, archivePath);
  }

  if (!url && !archiveUrl && isPdf) {
    return json({
      preview_unavailable: true,
      smb_unc: smbUnc,
      smb_pending: smbPending,
      smb_synced: smbSynced,
      mime,
      nome: row.arquivo_nome_original || arquivoPath.split('/').pop(),
      message: smbPending
        ? 'PDF na nuvem — aguardando cópia para a pasta de rede.'
        : 'PDF disponível apenas na pasta de rede corporativa (Controle DP).',
    });
  }

  if (!url && !archiveUrl) {
    return json({ error: 'Sem arquivo para visualizar.' }, 404);
  }

  return json({
    url: url || archiveUrl,
    archive_url: archiveUrl && url && archiveUrl !== url ? archiveUrl : null,
    download_url: isPdf ? archiveUrl || url : archiveUrl || url,
    expires_in: EXPIRES_SEC,
    mime: !isPdf && thumbPath && previewPath === thumbPath ? 'image/jpeg' : mime,
    nome: row.arquivo_nome_original || (previewPath || arquivoPath).split('/').pop(),
    is_thumbnail: Boolean(!isPdf && thumbPath && previewPath === thumbPath),
    smb_unc: smbUnc,
    smb_pending: smbPending,
    smb_synced: smbSynced,
    preview_unavailable: false,
    message: smbPending
      ? 'Completo na nuvem. Será copiado para a rede quando um equipamento local sincronizar.'
      : undefined,
  });
}
