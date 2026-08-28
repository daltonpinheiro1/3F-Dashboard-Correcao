/**
 * CRUD de atestados + upload de imagem (Supabase Storage).
 * Auth: sessão admin ou DASHBOARD_INSIGHT_SECRET.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  requireAtestadoRead,
  requireAtestadoWrite,
  isAtestadoAdmin,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import {
  sanitizeAtestadoPatch,
  sanitizeAtestadoPost,
  validateAtestadoPatchTransition,
  validateAtestadoPost,
  applySessionActorsToAtestadoPatch,
} from '../_lib/atestadosValidate';
import {
  buildAtestadosPgListPath,
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
} from '../_lib/atestadosList';
import { writeAtestadoAudit } from '../_lib/atestadosAudit';
import {
  ATESTADOS_BUCKET,
  buildAtestadoStoragePath,
  decodeImageBase64,
  gerarProtocoloAtestado,
  resolveStorageBase,
} from '../_lib/atestadosStorage';
import { sha256Hex } from '../_lib/atestadosHash';
import { findSobreposicoes } from '../_lib/atestadosDuplicidade';
import { toSmbUncPath } from '../_lib/atestadosSmbPaths';
import {
  persistAtestadoArquivoLegado,
  persistAtestadoArquivos,
} from '../_lib/atestadosSmbArchive';
import {
  atestadosEmailConfigured,
  buildDecisaoEmail,
  buildProtocoloEmail,
  sendAtestadoEmail,
  type AtestadosEmailEnv,
} from '../_lib/atestadosEmail';

const TABLE = 'atestados';
const hits = new Map<string, number[]>();

type Env = EnvAuth & AtestadosEmailEnv & {
  ATESTADOS_STORAGE_BASE?: string;
  ATESTADOS_SMB_BRIDGE_URL?: string;
  ATESTADOS_SMB_BRIDGE_SECRET?: string;
};

function atestadosUrlFromRequest(req: Request): string | undefined {
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}/atestados`;
  } catch {
    return undefined;
  }
}

function formatArquivoPathForEmail(path: string): string {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^atestados[\\/]/i.test(p)) return toSmbUncPath(p);
  return p;
}

async function notifyProtocolo(
  env: Env,
  req: Request,
  row: Record<string, unknown>,
  actor?: { email: string; full_name?: string },
) {
  if (!atestadosEmailConfigured(env)) return;
  const criado = String(row.criado_por_email || actor?.email || '').trim();
  const dp = String(env.ATESTADOS_EMAIL_DP || '').trim();
  const to = [...new Set([criado, dp].filter(Boolean))];
  if (!to.length) return;

  const un = String(row.unidade_periodo || 'dias');
  const periodo =
    un === 'horas'
      ? `${row.quantidade_horas || 0}h`
      : `${row.quantidade_dias || 0} dia(s)${row.data_inicio ? ` (${String(row.data_inicio).slice(0, 10)})` : ''}`;

  const copy = buildProtocoloEmail({
    protocolo: String(row.protocolo),
    colaboradorNome: String(row.colaborador_nome),
    tipo: String(row.tipo),
    periodo,
    protocoladoPor: String(row.criado_por_nome || actor?.full_name || criado),
    atestadosUrl: atestadosUrlFromRequest(req),
    arquivoPath: formatArquivoPathForEmail(String(row.arquivo_path || '')),
  });
  await sendAtestadoEmail({ env, to, ...copy }).catch(() => null);
}

async function notifyDecisao(
  env: Env,
  req: Request,
  row: Record<string, unknown>,
  status: 'aprovado' | 'recusado',
) {
  if (!atestadosEmailConfigured(env)) return;
  const to = String(row.criado_por_email || '').trim();
  if (!to) return;
  const copy = buildDecisaoEmail({
    protocolo: String(row.protocolo),
    colaboradorNome: String(row.colaborador_nome),
    status,
    analisadoPor: String(row.analisado_por_nome || row.analisado_por_email || 'DP'),
    recusaMotivo: status === 'recusado' ? String(row.recusa_motivo || '') : undefined,
    atestadosUrl: atestadosUrlFromRequest(req),
  });
  await sendAtestadoEmail({ env, to: [to], ...copy }).catch(() => null);
}

async function tableExists(env: Env): Promise<boolean> {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?select=id&limit=1`);
  if (r.ok) return true;
  const t = await r.text();
  if (/PGRST205|Could not find the table|schema cache/i.test(t)) return false;
  if (r.status === 401 || r.status === 403) return true;
  return r.status !== 404;
}

async function ensureBucket(env: Env) {
  const list = await sbFetch(env, '/storage/v1/bucket');
  if (list.ok) {
    const buckets = (await list.json()) as { id?: string; name?: string }[];
    if (buckets.some((b) => b.id === ATESTADOS_BUCKET || b.name === ATESTADOS_BUCKET)) return;
  }
  const created = await sbFetch(env, '/storage/v1/bucket', {
    method: 'POST',
    body: JSON.stringify({ id: ATESTADOS_BUCKET, name: ATESTADOS_BUCKET, public: false }),
  });
  if (!created.ok && created.status !== 409) {
    const t = await created.text();
    throw new Error(`Falha ao criar bucket atestados: ${created.status} ${t.slice(0, 180)}`);
  }
}

async function uploadArquivo(
  env: Env,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  await ensureBucket(env);
  const r = await sbFetch(env, `/storage/v1/object/${ATESTADOS_BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': mime, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao enviar arquivo: ${r.status} ${t.slice(0, 200)}`);
  }
}

async function listPgPage(
  env: Env,
  opts: {
    limit: number;
    cursorRaw: string | null;
    status: string | null;
    ano: string | null;
    colaborador: string | null;
    criado_por_email?: string | null;
  },
) {
  const cursor = decodeListCursor(opts.cursorRaw);
  if (opts.cursorRaw && !cursor) throw new Error('cursor inválido.');
  const path = buildAtestadosPgListPath({
    limit: opts.limit,
    cursor,
    status: opts.status,
    ano: opts.ano,
    colaborador: opts.colaborador,
    criado_por_email: opts.criado_por_email,
  });
  const r = await sbFetch(env, path);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao listar atestados: ${r.status} ${t.slice(0, 180)}`);
  }
  const fetched = (await r.json()) as Record<string, unknown>[];
  const has_more = fetched.length > opts.limit;
  const rows = has_more ? fetched.slice(0, opts.limit) : fetched;
  const last = rows[rows.length - 1];
  const next_cursor =
    has_more && last
      ? encodeListCursor({
          created_at: String(last.created_at || ''),
          id: String(last.id || ''),
        })
      : null;
  return { rows, next_cursor, has_more, limit: opts.limit, storage: 'postgres' as const };
}

async function getPgRow(env: Env, id: string): Promise<Record<string, unknown> | null> {
  const r = await sbFetch(
    env,
    `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao buscar atestado: ${r.status} ${t.slice(0, 180)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  return data[0] || null;
}

async function insertPg(env: Env, row: Record<string, unknown>) {
  const r = await sbFetch(env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao inserir atestado: ${r.status} ${t.slice(0, 220)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  return data[0] || row;
}

async function patchPg(env: Env, id: string, patch: Record<string, unknown>) {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao atualizar atestado: ${r.status} ${t.slice(0, 220)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  if (!data[0]) throw new Error('Registro não encontrado.');
  return data[0];
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAtestadoRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json(
      { error: 'Tabela atestados indisponível. Confirme migration 020 no Supabase.' },
      503,
    );
  }
  try {
    const url = new URL(context.request.url);
    const admin = isAtestadoAdmin(auth);
    const supervisorEmail =
      !admin && auth.mode === 'session' ? String(auth.user?.email || '').trim() : '';
    const byId = (url.searchParams.get('id') || '').trim();
    if (byId) {
      const row = await getPgRow(context.env, byId);
      if (row && supervisorEmail) {
        const owner = String(row.criado_por_email || '').trim().toLowerCase();
        if (owner !== supervisorEmail.toLowerCase()) {
          return json({ rows: [], next_cursor: null, has_more: false, limit: 1, storage: 'postgres' });
        }
      }
      return json({
        rows: row ? [row] : [],
        next_cursor: null,
        has_more: false,
        limit: 1,
        storage: 'postgres',
      });
    }
    const limit = clampListLimit(url.searchParams.get('limit'));
    const cursorRaw = url.searchParams.get('cursor');
    if (cursorRaw && !decodeListCursor(cursorRaw)) {
      return json({ error: 'cursor inválido.' }, 400);
    }
    const status = url.searchParams.get('status');
    const ano = url.searchParams.get('ano');
    const colaborador = url.searchParams.get('colaborador');
    const criado_por_email =
      admin ? null : colaborador?.trim() ? null : supervisorEmail || null;
    if (!admin && colaborador && colaborador.trim().length < 2) {
      return json({ error: 'Filtro colaborador deve ter ao menos 2 caracteres.' }, 400);
    }
    return json(
      await listPgPage(context.env, {
        limit,
        cursorRaw,
        status,
        ano,
        colaborador: admin || colaborador?.trim() ? colaborador : null,
        criado_por_email,
      }),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /cursor inválido/i.test(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
}

async function listColaboradorAtivos(env: Env, row: Record<string, unknown>) {
  const nome = String(row.colaborador_nome || '').trim();
  const mat = String(row.colaborador_matricula || '').trim();
  const qs = mat
    ? `colaborador_matricula=eq.${encodeURIComponent(mat)}`
    : `colaborador_nome=ilike.${encodeURIComponent(nome)}`;
  const r = await sbFetch(
    env,
    `/rest/v1/${TABLE}?${qs}&select=*&status=neq.recusado&limit=200`,
  );
  if (!r.ok) return [];
  return (await r.json()) as Record<string, unknown>[];
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAtestadoWrite(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json({ error: 'Tabela atestados indisponível.' }, 503);
  }
  try {
    const payload = (await context.request.json()) as Record<string, unknown> & {
      imagem_base64?: string;
      imagem_thumb_base64?: string;
      ignorar_duplicidade?: boolean;
    };
    const now = new Date().toISOString();
    const sanitized = sanitizeAtestadoPost(payload);
    const valid = validateAtestadoPost(sanitized);
    if (!valid.ok) return json({ error: valid.error }, 400);

    if (auth.mode === 'session' && auth.user?.role === 'supervisor') {
      sanitized.origem = 'supervisor';
      sanitized.status = 'protocolado';
    } else if (!sanitized.origem) {
      sanitized.origem = 'dp';
    }

    const existentes = await listColaboradorAtivos(context.env, sanitized);
    const sobrepos = findSobreposicoes(existentes, sanitized);
    if (sobrepos.length && !payload.ignorar_duplicidade) {
      return json(
        {
          error: 'Período sobreposto com atestado existente.',
          duplicidades: sobrepos.map((d) => ({
            id: d.id,
            protocolo: d.protocolo,
            data_inicio: d.data_inicio,
            data_fim: d.data_fim,
            status: d.status,
          })),
        },
        409,
      );
    }

    const protocolo = gerarProtocoloAtestado();
    const dataRef =
      String(sanitized.data_inicio || '').slice(0, 10) || now.slice(0, 10);
    const nome = String(sanitized.colaborador_nome || '').trim();

    let arquivo_path: string | null = null;
    let arquivo_thumb_path: string | null = null;
    let arquivo_cloud_archive_path: string | null = null;
    let arquivo_smb_synced_at: string | null = null;
    let arquivo_mime: string | null = null;
    let arquivo_tamanho_bytes: number | null = null;
    let arquivo_hash_sha256: string | null = null;

    const upload = (path: string, bytes: Uint8Array, mime: string) =>
      uploadArquivo(context.env, path, bytes, mime);

    const imgRaw = String(payload.imagem_base64 || '').trim();
    const thumbRaw = String(payload.imagem_thumb_base64 || '').trim();
    if (imgRaw) {
      const decoded = decodeImageBase64(imgRaw);
      if (!decoded.ok) return json({ error: decoded.error }, 400);
      arquivo_hash_sha256 = await sha256Hex(decoded.bytes);

      const dupHash = existentes.find(
        (e) => String(e.arquivo_hash_sha256 || '') === arquivo_hash_sha256,
      );
      if (dupHash && !payload.ignorar_duplicidade) {
        return json(
          {
            error: 'Arquivo idêntico já protocolado.',
            duplicidade_hash: String(dupHash.protocolo || dupHash.id),
          },
          409,
        );
      }

      const basePath = resolveStorageBase(context.env.ATESTADOS_STORAGE_BASE);
      arquivo_path = buildAtestadoStoragePath({
        basePath,
        dataReferencia: dataRef,
        colaboradorNome: nome,
        protocolo,
        mime: decoded.mime,
      });
      arquivo_mime = decoded.mime;
      arquivo_tamanho_bytes = decoded.bytes.length;

      const isPdf = decoded.mime === 'application/pdf';
      let persisted;

      if (thumbRaw && !isPdf) {
        const thumbDecoded = decodeImageBase64(thumbRaw);
        if (!thumbDecoded.ok) return json({ error: thumbDecoded.error }, 400);
        persisted = await persistAtestadoArquivos({
          env: context.env,
          arquivo_path,
          bytes: decoded.bytes,
          mime: decoded.mime,
          thumbBytes: thumbDecoded.bytes,
          uploadArquivo: upload,
        });
      } else if (isPdf) {
        persisted = await persistAtestadoArquivos({
          env: context.env,
          arquivo_path,
          bytes: decoded.bytes,
          mime: decoded.mime,
          uploadArquivo: upload,
        });
      } else {
        persisted = await persistAtestadoArquivoLegado({
          env: context.env,
          arquivo_path,
          bytes: decoded.bytes,
          mime: decoded.mime,
          uploadArquivo: upload,
        });
      }

      arquivo_thumb_path = persisted.arquivo_thumb_path;
      arquivo_cloud_archive_path = persisted.arquivo_cloud_archive_path;
      arquivo_smb_synced_at = persisted.arquivo_smb_synced_at;
    }

    const row: Record<string, unknown> = {
      ...sanitized,
      id: crypto.randomUUID(),
      protocolo,
      created_at: now,
      updated_at: now,
      status: String(sanitized.status || 'protocolado'),
      arquivo_path,
      arquivo_thumb_path,
      arquivo_cloud_archive_path,
      arquivo_smb_synced_at,
      arquivo_mime,
      arquivo_tamanho_bytes,
      arquivo_hash_sha256,
      ia_analise: sanitized.ia_analise || {},
    };

    if (auth.mode === 'session' && auth.user) {
      row.criado_por_email = auth.user.email;
      row.criado_por_nome = auth.user.full_name || auth.user.email;
    }

    const inserted = await insertPg(context.env, row);
    await writeAtestadoAudit(context.env, {
      atestado_id: String(inserted.id),
      action: 'create',
      actor_email: auth.user?.email,
      actor_nome: auth.user?.full_name,
      payload: {
        protocolo,
        arquivo_path,
        arquivo_thumb_path,
        arquivo_cloud_archive_path,
        arquivo_smb_synced_at,
        arquivo_hash_sha256,
        origem: row.origem,
      },
    });

    await notifyProtocolo(context.env, context.request, inserted, auth.user);

    return json({ row: inserted, storage: 'postgres' }, 201);
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json({ error: 'Tabela atestados indisponível.' }, 503);
  }
  try {
    const url = new URL(context.request.url);
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) return json({ error: 'id obrigatório.' }, 400);

    const current = await getPgRow(context.env, id);
    if (!current) return json({ error: 'Atestado não encontrado.' }, 404);

    const payload = (await context.request.json()) as Record<string, unknown>;
    const patch = sanitizeAtestadoPatch(payload);
    if (auth.mode === 'session' && auth.user) {
      applySessionActorsToAtestadoPatch(patch, auth.user);
    }

    const valid = validateAtestadoPatchTransition(current, patch);
    if (!valid.ok) return json({ error: valid.error }, 400);

    const updated = await patchPg(context.env, id, patch);
    await writeAtestadoAudit(context.env, {
      atestado_id: id,
      action: 'patch',
      actor_email: auth.user?.email,
      actor_nome: auth.user?.full_name,
      payload: patch,
    });

    const newStatus = String(updated.status || '');
    if (newStatus === 'aprovado' || newStatus === 'recusado') {
      await notifyDecisao(context.env, context.request, updated, newStatus);
    }

    return json({ row: updated, storage: 'postgres' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
