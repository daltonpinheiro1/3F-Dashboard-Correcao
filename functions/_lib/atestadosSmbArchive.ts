/**
 * Persistência dual: miniatura + arquivo completo na nuvem, e tentativa na pasta de rede (SMB).
 * Cloudflare não fala SMB; o bridge/sync completa a rede. A nuvem nunca é apagada depois do sync.
 */

import {
  buildAtestadoCloudArchivePath,
  buildAtestadoThumbStoragePath,
} from './atestadosStorage';
import { pushArquivoToSmbBridge, type AtestadosSmbPushEnv } from './atestadosSmbPush';

type UploadFn = (
  path: string,
  bytes: Uint8Array,
  mime: string,
) => Promise<void>;

export type AtestadoArquivoPersistResult = {
  arquivo_thumb_path: string | null;
  arquivo_cloud_archive_path: string | null;
  arquivo_smb_synced_at: string | null;
};

export async function persistAtestadoArquivos(opts: {
  env: AtestadosSmbPushEnv;
  arquivo_path: string;
  bytes: Uint8Array;
  mime: string;
  thumbBytes?: Uint8Array | null;
  uploadArquivo: UploadFn;
}): Promise<AtestadoArquivoPersistResult> {
  const { env, arquivo_path, bytes, mime, thumbBytes, uploadArquivo } = opts;
  let arquivo_thumb_path: string | null = null;

  if (thumbBytes && thumbBytes.length > 0 && mime !== 'application/pdf') {
    arquivo_thumb_path = buildAtestadoThumbStoragePath(arquivo_path);
    await uploadArquivo(arquivo_thumb_path, thumbBytes, 'image/jpeg');
  }

  const push = await pushArquivoToSmbBridge(env, { path: arquivo_path, bytes, mime });
  const arquivo_cloud_archive_path = buildAtestadoCloudArchivePath(arquivo_path);
  await uploadArquivo(arquivo_cloud_archive_path, bytes, mime);

  return {
    arquivo_thumb_path,
    arquivo_cloud_archive_path,
    arquivo_smb_synced_at: push.ok ? new Date().toISOString() : null,
  };
}

/** Fluxo legado: arquivo completo no bucket + tentativa SMB. */
export async function persistAtestadoArquivoLegado(opts: {
  env: AtestadosSmbPushEnv;
  arquivo_path: string;
  bytes: Uint8Array;
  mime: string;
  uploadArquivo: UploadFn;
}): Promise<AtestadoArquivoPersistResult> {
  await opts.uploadArquivo(opts.arquivo_path, opts.bytes, opts.mime);
  const push = await pushArquivoToSmbBridge(opts.env, {
    path: opts.arquivo_path,
    bytes: opts.bytes,
    mime: opts.mime,
  });
  const arquivo_cloud_archive_path = buildAtestadoCloudArchivePath(opts.arquivo_path);
  await opts.uploadArquivo(arquivo_cloud_archive_path, opts.bytes, opts.mime);
  return {
    arquivo_thumb_path: null,
    arquivo_cloud_archive_path,
    arquivo_smb_synced_at: push.ok ? new Date().toISOString() : null,
  };
}
