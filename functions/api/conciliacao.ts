import { authorizeRequest, json, sbFetch, type EnvAuth } from '../_lib/auth';

/** Agregado da interseção. Sessão obrigatória. O JSON não fica em /public. */
export const onRequestGet: PagesFunction<EnvAuth> = async (context) => {
  const auth = await authorizeRequest(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const resp = await sbFetch(
      context.env,
      '/storage/v1/object/eva-dash/portabilidade/conciliacao/atual.json',
      { headers: { Accept: 'application/json' } },
    );
    if (!resp.ok) return json({ error: 'Conciliação ainda não publicada.' }, 404);
    const body = await resp.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return json({ error: 'Falha ao ler a conciliação.' }, 502);
  }
};
