import { test, expect, type Page, type Route } from '@playwright/test';

const AUTH_KEY = '3f-dashboard-auth';

type AtestadoRow = Record<string, unknown>;

async function injectAuth(page: Page) {
  const sessionExpiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
  await page.evaluate(
    ([k, exp]) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          state: {
            isAuthenticated: true,
            userName: 'Admin E2E',
            userEmail: 'admin@3f.com',
            userRole: 'admin',
            sessionExpiresAt: exp,
            sessionNonce: 'e2e_nonce_' + 'x'.repeat(24),
          },
          version: 0,
        }),
      );
    },
    [AUTH_KEY, sessionExpiresAt] as const,
  );
}

function baseRow(partial: AtestadoRow): AtestadoRow {
  const now = new Date().toISOString();
  return {
    protocolo: 'AT-2026-E2E001',
    colaborador_nome: 'Colaborador E2E',
    colaborador_matricula: 'E2E001',
    tipo: 'medico',
    unidade_periodo: 'dias',
    quantidade_dias: 2,
    quantidade_horas: 0,
    data_inicio: now.slice(0, 10),
    status: 'protocolado',
    ia_analise: {},
    arquivo_path: 'atestados-local/testes/2026/08/28/colaborador_e2e_AT-2026-E2E001.jpg',
    criado_por_email: 'admin@3f.com',
    criado_por_nome: 'Admin E2E',
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

async function mockAtestadosApi(page: Page, seed: AtestadoRow[] = []) {
  const store: { rows: AtestadoRow[] } = { rows: [...seed] };

  await page.route('**/api/atestados**', async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: store.rows,
          next_cursor: null,
          has_more: false,
          storage: 'mock',
        }),
      });
      return;
    }

    if (method === 'POST') {
      const body = (await req.postDataJSON()) as AtestadoRow;
      const row = baseRow({
        id: 'e2e-new-id',
        protocolo: 'AT-2026-NEW001',
        ...body,
      });
      store.rows.unshift(row);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ row, storage: 'mock' }),
      });
      return;
    }

    if (method === 'PATCH') {
      const id = url.searchParams.get('id');
      const body = (await req.postDataJSON()) as AtestadoRow;
      const idx = store.rows.findIndex((r) => String(r.id) === id);
      if (idx >= 0) {
        store.rows[idx] = { ...store.rows[idx], ...body, updated_at: new Date().toISOString() };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ row: store.rows[idx], storage: 'mock' }),
        });
        return;
      }
    }

    await route.fulfill({ status: 404, body: '{}' });
  });

  await page.route('**/api/atestado-analise**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        analise: {
          tipo: 'medico',
          unidade_periodo: 'dias',
          quantidade_dias: 1,
          data_inicio: new Date().toISOString().slice(0, 10),
          cid: 'J06.9',
          requisitos: { periodo: true, cid: true, nome_medico: true, crm: false, assinatura_carimbo: true, nome_paciente: true, tipo_documento: true },
          alertas: [],
          resumo: 'Análise mock e2e.',
          confianca: 0.85,
        },
      }),
    });
  });

  await page.route('**/api/atestado-arquivo**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        mime: 'image/png',
      }),
    });
  });
}

test.describe('Atestados — fluxo protocolo', () => {
  test('página carrega abas e acervo', async ({ page }) => {
    await mockAtestadosApi(page, [baseRow({ id: 'e2e-1' })]);
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/atestados');
    await expect(page.getByRole('heading', { name: /Atestados/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Protocolar' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Acervo' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Gerencial anual' })).toBeVisible();
    await page.getByRole('tab', { name: 'Acervo' }).click();
    await expect(page.getByText('AT-2026-E2E001')).toBeVisible();
    await expect(page.getByText('Colaborador E2E')).toBeVisible();
  });

  test('aprovar atestado no modal de detalhe', async ({ page }) => {
    await mockAtestadosApi(page, [baseRow({ id: 'e2e-approve' })]);
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/atestados');
    await page.getByRole('tab', { name: 'Acervo' }).click();
    await page.getByText('AT-2026-E2E001').click();
    await expect(page.getByText('Documento anexado')).toBeVisible();
    await page.getByRole('button', { name: /Aprovar/i }).click();
    await expect(page.getByText(/Status atualizado/i)).toBeVisible({ timeout: 5000 });
  });
});
