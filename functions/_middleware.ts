const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

function requestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim() || '';
  if (REQUEST_ID_RE.test(incoming)) return incoming;
  const ray = request.headers.get('cf-ray')?.trim() || '';
  return REQUEST_ID_RE.test(ray) ? ray : crypto.randomUUID();
}

function withHeaders(response: Response, id: string, durationMs: number): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', id);
  headers.set('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest: PagesFunction = async (context) => {
  const started = performance.now();
  const id = requestId(context.request);
  const url = new URL(context.request.url);
  let response: Response;
  let thrown: unknown;
  try {
    response = await context.next();
  } catch (error) {
    thrown = error;
    response = new Response(JSON.stringify({ error: 'Erro interno.', request_id: id }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const durationMs = performance.now() - started;
  const event = {
    ts: new Date().toISOString(),
    level: thrown || response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
    request_id: id,
    cf_ray: context.request.headers.get('cf-ray') || undefined,
    method: context.request.method,
    path: url.pathname,
    status: response.status,
    duration_ms: Math.round(durationMs * 10) / 10,
    error: thrown instanceof Error ? thrown.name : undefined,
  };
  console.log(JSON.stringify(event));
  return withHeaders(response, id, durationMs);
};
