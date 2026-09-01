/**
 * GET /api/knowledge-search?q=...
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { searchKnowledge, type KnowledgeChunk } from '../_lib/operacionalIntel';

const TABLE = 'knowledge_chunks';
const hits = new Map<string, number[]>();

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const q = new URL(context.request.url).searchParams.get('q')?.trim() || '';

  const r = await sbFetch(
    context.env,
    `/rest/v1/${TABLE}?select=id,categoria,titulo,conteudo,tags&order=created_at.desc&limit=50`,
  );
  if (r.status === 404 || r.status === 406) {
    return json({ rows: [], aviso: 'Base de conhecimento indisponível. Confirme migration 030.' });
  }
  if (!r.ok) return json({ error: 'Falha ao buscar conhecimento.' }, 502);

  const chunks = (await r.json()) as KnowledgeChunk[];
  const rows = q ? searchKnowledge(chunks, q) : chunks.slice(0, 12);
  return json({ rows, total: chunks.length });
}
