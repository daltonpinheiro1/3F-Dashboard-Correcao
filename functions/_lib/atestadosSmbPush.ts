/**
 * Push opcional para bridge SMB na rede 3F (Cloudflare não acessa SMB diretamente).
 * Configure ATESTADOS_SMB_BRIDGE_URL + ATESTADOS_SMB_BRIDGE_SECRET no Pages.
 */

export type AtestadosSmbPushEnv = {
  ATESTADOS_SMB_BRIDGE_URL?: string;
  ATESTADOS_SMB_BRIDGE_SECRET?: string;
};

export function smbBridgeConfigured(env: AtestadosSmbPushEnv): boolean {
  return Boolean(
    String(env.ATESTADOS_SMB_BRIDGE_URL || '').trim() &&
      String(env.ATESTADOS_SMB_BRIDGE_SECRET || '').trim(),
  );
}

/** Base64 seguro para binários grandes (Workers). */
export function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

/** Envia arquivo ao bridge; falhas são ignoradas (Supabase continua sendo fonte primária). */
export async function pushArquivoToSmbBridge(
  env: AtestadosSmbPushEnv,
  opts: { path: string; bytes: Uint8Array; mime: string },
): Promise<{ ok: boolean; error?: string }> {
  const url = String(env.ATESTADOS_SMB_BRIDGE_URL || '').trim();
  const secret = String(env.ATESTADOS_SMB_BRIDGE_SECRET || '').trim();
  if (!url || !secret) return { ok: false, error: 'bridge não configurado' };

  const body = JSON.stringify({
    path: opts.path,
    mime: opts.mime,
    base64: uint8ToBase64(opts.bytes),
  });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body,
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, error: `${r.status} ${t.slice(0, 180)}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
