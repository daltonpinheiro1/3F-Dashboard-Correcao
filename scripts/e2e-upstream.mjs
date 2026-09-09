import http from 'node:http';

const port = Number(process.env.E2E_UPSTREAM_PORT || 8790);
const nonce = 'e2e-session-' + 'x'.repeat(24);

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/health') return send(res, 200, { ok: true });

  if (url.pathname === '/rest/v1/rpc/login_user' && req.method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    if (body.p_email !== 'admin@3f.test' || body.p_password !== 'e2e-password') {
      return send(res, 200, { success: false, error: 'invalid_credentials' });
    }
    return send(res, 200, {
      success: true,
      email: 'admin@3f.test',
      full_name: 'Admin E2E',
      role: 'admin',
      session_expires_at: '2099-01-01T00:00:00.000Z',
      session_nonce: nonce,
    });
  }

  if (url.pathname === '/rest/v1/rpc/verify_dashboard_session' && req.method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    return send(res, 200, {
      valid: body.p_email === 'admin@3f.test' && body.p_nonce === nonce,
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@3f.test',
      full_name: 'Admin E2E',
      role: 'admin',
    });
  }

  if (url.pathname === '/rest/v1/correcao_logs') {
    return send(res, 200, [
      {
        id: 'log-e2e-1',
        proposta_id: 'PROP-E2E',
        tipos_erro: ['cep_incorreto'],
        campos_alterados: ['cep'],
        elapsed_ms: 1200,
        supervisor: 'Supervisão E2E',
        equipe: 'Equipe E2E',
        vendedor: 'Operador E2E',
        data_venda: '2026-09-09T00:00:00.000Z',
        created_at: '2026-09-09T12:00:00.000Z',
      },
    ]);
  }
  if (url.pathname === '/rest/v1/sms_eficiencia') return send(res, 200, []);

  if (url.pathname === '/storage/v1/object/eva-dash/live.json') {
    return send(res, 200, {
      data: '2026-09-09',
      updated_at: '2026-09-09T12:00:00-03:00',
      kpis_operacao: {},
      kpis_chamadas: { tabuladas: 1 },
      jornada: [],
      pausas_por_tipo: [],
      chamadas_recente: [],
      top_tabulacao: [],
      por_campanha: [],
      serie_hora: [],
    });
  }

  send(res, 404, { error: `Fixture ausente: ${req.method} ${url.pathname}` });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`E2E upstream ready on http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
