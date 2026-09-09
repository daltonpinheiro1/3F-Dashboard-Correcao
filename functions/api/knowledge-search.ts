/**
 * GET /api/knowledge-search?q=...
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { searchKnowledge, type KnowledgeChunk } from '../_lib/operacionalIntel';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

const TABLE = 'knowledge_chunks';
type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'knowledge-search'))) return json({ error: 'Rate limit.' }, 429);
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
