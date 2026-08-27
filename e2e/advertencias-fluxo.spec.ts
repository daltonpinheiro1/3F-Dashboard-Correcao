import { test, expect, type Page, type Route } from '@playwright/test';

const AUTH_KEY = '3f-dashboard-auth';

type AdvRow = Record<string, unknown>;

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

function baseRow(partial: AdvRow): AdvRow {
  const now = new Date().toISOString();
  return {
    colaborador_nome: 'Operador Seed',
    colaborador_matricula: 'E2E001',
    motivo_categoria: 'DESIDIA NO DESEMPENHO DAS FUNCOES',
    motivo_texto: 'Submotivo e2e',
    descricao: 'Narrativa factual de teste e2e com fatos objetivos suficientes.',
    data_ocorrido: now.slice(0, 10),
    nivel_idx: 3,
    nivel_codigo: 'suspensao_1',
    nivel_label: 'Suspensão 1 dia',
    dias_suspensao: 1,
    status: 'pendente',
    entrega_status: 'aguardando_aprovacao',
    notificacao_status: 'desativada',
    criado_por_email: 'sup@3f.com',
    criado_por_nome: 'Supervisor',
    created_at: now,
    updated_at: now,
    anexos: [],
    ...partial,
  };
}

async function mockAdvertenciasApi(page: Page, seed: AdvRow[] = []) {
  const store: { rows: AdvRow[] } = { rows: [...seed] };

  await page.route('**/api/advertencias**', async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === 'GET') {
      const byId = url.searchParams.get('id');
      if (byId) {
        const row = store.rows.find((r) => String(r.id) === byId) || null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rows: row ? [row] : [],
            next_cursor: null,
            has_more: false,
            limit: 1,
            storage: 'mock',
          }),
        });
        return;
      }

      const status = url.searchParams.get('status');
      let sorted = [...store.rows].sort((a, b) => {
        const byDate = String(b.created_at || '').localeCompare(String(a.created_at || ''));
        if (byDate !== 0) return byDate;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
      if (status) {
        sorted = sorted.filter((r) => String(r.status || '') === status);
      }

      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)));
      const cursor = url.searchParams.get('cursor');
      let start = 0;
      if (cursor) {
        try {
          const text = atob(cursor);
          const nl = text.indexOf('\n');
          if (nl <= 0) throw new Error('bad');
          const ca = text.slice(0, nl);
          const id = text.slice(nl + 1);
          start = sorted.findIndex((r) => {
            const rca = String(r.created_at || '');
            const rid = String(r.id || '');
            return rca < ca || (rca === ca && rid < id);
          });
          if (start < 0) start = sorted.length;
        } catch {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'cursor inválido.' }),
          });
          return;
        }
      }
      const slice = sorted.slice(start, start + limit + 1);
      const has_more = slice.length > limit;
      const rows = has_more ? slice.slice(0, limit) : slice;
      const last = rows[rows.length - 1];
      const next_cursor =
        has_more && last
          ? btoa(`${String(last.created_at || '')}\n${String(last.id || '')}`)
          : null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows, next_cursor, has_more, limit, storage: 'mock' }),
      });
      return;
    }

    if (method === 'POST') {
      const body = req.postDataJSON() as AdvRow;
      const now = new Date().toISOString();
      const row: AdvRow = {
        ...body,
        id: String(body.id || `e2e-${Date.now()}`),
        created_at: now,
        updated_at: now,
        criado_por_email: body.criado_por_email || 'admin@3f.com',
        criado_por_nome: body.criado_por_nome || 'Admin E2E',
      };
      store.rows.unshift(row);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ row, storage: 'mock' }),
      });
      return;
    }

    if (method === 'PATCH') {
      const body = req.postDataJSON() as { id?: string; patch?: AdvRow };
      const idx = store.rows.findIndex((r) => String(r.id) === String(body.id));
      if (idx < 0) {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: 'não encontrado' }) });
        return;
      }
      store.rows[idx] = {
        ...store.rows[idx],
        ...(body.patch || {}),
        id: store.rows[idx].id,
        updated_at: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ row: store.rows[idx], storage: 'mock' }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test.describe('Advertências — fluxo de negócio (API mock)', () => {
  test('Enviadas → aprovar → Autorizadas → impressão → entrega → Recebidas', async ({ page }) => {
    test.setTimeout(60_000);
    await mockAdvertenciasApi(page, [
      baseRow({
        id: 'seed-pendente-1',
        colaborador_nome: 'Operador E2E Pendente',
        status: 'pendente',
        entrega_status: 'aguardando_aprovacao',
        nivel_idx: 3,
        dias_suspensao: 1,
      }),
    ]);
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/advertencias?inbox=enviadas');
    await expect(page.locator('text=Gestão de Advertências')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Operador E2E Pendente')).toBeVisible({ timeout: 10_000 });

    // Botão da linha (não o bulk "Aprovar selecionadas")
    await page.getByRole('button', { name: 'Aprovar', exact: true }).first().click();
    await expect(page.getByText(/Advertência aprovada/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('group', { name: 'Filas do Controle DP' }).getByRole('button', { name: /Autorizadas/ }).click();
    await expect(page.locator('text=Operador E2E Pendente')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Ver', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Detalhe da advertência' })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Marcar como impresso' }).click();
    await expect(page.getByRole('button', { name: /Confirmar entrega/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Confirmar entrega/ }).click();
    await expect(page.getByText(/Entrega\/protocolo registrado|registrado com sucesso/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Fecha o detalhe (modal-close) — após entrega a fila já vai para Recebidas
    await page.locator('.modal-close').click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    await page.getByRole('group', { name: 'Filas do Controle DP' }).getByRole('button', { name: /Recebidas/ }).click();
    await expect(page.locator('text=Operador E2E Pendente')).toBeVisible({ timeout: 10_000 });
  });

  test('Criação feedback formal cai em Autorizadas (PDF na hora)', async ({ page }) => {
    test.setTimeout(60_000);
    await mockAdvertenciasApi(page, []);
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/advertencias');
    await expect(page.locator('text=Gestão de Advertências')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: /Criação/ }).click();
    await page.getByRole('button', { name: 'Abrir formulário' }).click();
    await expect(page.getByRole('heading', { name: 'Nova advertência' })).toBeVisible();

    await page.getByPlaceholder(/Digite nome|Carregando operadores/i).fill('Operador E2E Feedback');
    await page.locator('textarea').first().fill(
      'E2E feedback: orientação registrada sobre pontualidade e procedimento de tabulação.',
    );

    const selects = page.locator('.card select.input-field');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const sel = selects.nth(i);
      const options = sel.locator('option');
      const oc = await options.count();
      for (let j = 0; j < oc; j++) {
        const val = await options.nth(j).getAttribute('value');
        if (val) {
          await sel.selectOption(val);
          break;
        }
      }
    }

    const tipo = page.locator('select.input-field').filter({ hasText: /Feedback formal/i }).first();
    if (await tipo.count()) {
      await tipo.selectOption('feedback_formal');
    }

    await page.getByRole('button', { name: 'Salvar e gerar PDF' }).click();
    await expect(page.getByText(/Documento gerado|pronto para impressão/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('group', { name: 'Filas do Controle DP' }).getByRole('button', { name: /Autorizadas/ }).click();
    await expect(page.locator('text=Operador E2E Feedback')).toBeVisible({ timeout: 10_000 });
  });
});
