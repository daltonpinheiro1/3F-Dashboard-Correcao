import { test, expect, type Page } from '@playwright/test';

const AUTH_KEY = '3f-dashboard-auth';

function mesAtualBrtE2e() {
  const sp = new Date(Date.now() - 3 * 3600_000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MES_ATUAL = mesAtualBrtE2e();

const FUNIL_MOCK = {
  ok: true,
  gerencial: {
    taxa_sucesso_tim_pct: 14,
    taxa_portado_pct: 11.5,
    taxa_falha_parcial_pct: 2.5,
    taxa_fechamento_pct: 52,
    taxa_cancelamento_pct: 38,
    taxa_quebra_pct: 6.7,
    taxa_em_voo_pct: 47.8,
    taxa_sucesso_tim_sobre_fechados_pct: 27,
    sucesso_tim: 918,
    portados: 753,
    falha_parcial: 165,
    canceladas: 2506,
    fechados: 3424,
    quebras: 439,
    bko: 797,
    com_os: 6414,
    com_ticket: 4703,
  },
  reconciliacao: {
    universo: 6558,
    soma_fatias: 6558,
    soma_grupos: 6558,
    fecha: true,
    confianca: 'completa',
    em_voo: 3134,
    fechados: 3424,
    orfaos: 0,
  },
  estagios: [
    { id: 'fechamento', label: 'Fechamento', valor: 3424, pct: 52.2 },
    { id: 'fila', label: 'Fila', valor: 1016, pct: 15.5 },
  ],
  funil_conversao: [
    { id: 'universo', label: 'Universo', valor: 6558, pct: 100 },
    { id: 'portado', label: 'Portado', valor: 753, pct: 11.5 },
  ],
  funil_exclusivo: [
    { id: 'portado', label: 'Portado', valor: 753, pct: 11.5 },
    { id: 'falha_parcial', label: 'Falha parcial', valor: 165, pct: 2.5 },
    { id: 'cancelada', label: 'Cancelada', valor: 2506, pct: 38.2 },
    { id: 'em_voo', label: 'Em voo', valor: 3134, pct: 47.8 },
  ],
  funil_pontes: { sem_os: 144, os_sem_ticket: 144, ticket_nao_fechado: 1102 },
  fatias: [{ id: 'bko', label: 'BKO', grupo: 'fila', cor: 'amber', descricao: '', count: 797, pct: 12 }],
  periodo: { mes: '2026-08', modo: 'operacional', label: 'Operacional' },
};

const HISTORICO_MOCK = {
  ok: true,
  serie: [
    {
      mes: '2026-06',
      portados: 700,
      falha_parcial: 150,
      canceladas: 400,
      fechados: 1250,
      sucesso_tim: 850,
      universo: 5000,
      quebras: 80,
      bko: 90,
      execucoes: 5000,
      activate_ok: 600,
      taxa_portado_pct: 56,
      taxa_sucesso_tim_pct: 17,
      taxa_sucesso_fila_pct: 92,
      fonte: 'rpc',
    },
    {
      mes: '2026-07',
      portados: 680,
      falha_parcial: 140,
      canceladas: 420,
      fechados: 1240,
      sucesso_tim: 820,
      universo: 5100,
      quebras: 90,
      bko: 100,
      execucoes: 4800,
      activate_ok: 580,
      taxa_portado_pct: 55,
      taxa_sucesso_tim_pct: 16,
      taxa_sucesso_fila_pct: 91,
      fonte: 'rpc',
    },
    {
      mes: MES_ATUAL,
      portados: 753,
      falha_parcial: 165,
      canceladas: 2506,
      fechados: 3424,
      sucesso_tim: 918,
      universo: 6558,
      quebras: 439,
      bko: 797,
      execucoes: 5200,
      activate_ok: 610,
      taxa_portado_pct: 22,
      taxa_sucesso_tim_pct: 14,
      taxa_sucesso_fila_pct: 93,
      fonte: 'rpc',
    },
  ],
};

async function injectAuth(page: Page) {
  const sessionExpiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
  await page.evaluate(
    ([k, exp]) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          state: {
            isAuthenticated: true,
            userName: 'Admin',
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

async function mockDisparosApis(page: Page) {
  await page.route('**/api/portabilidade-funil**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FUNIL_MOCK),
    });
  });
  await page.route('**/api/portabilidade-disparos**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, totais_ao_vivo: { pendentes: 10, concluidas_hoje: 5 } }),
    });
  });
  await page.route('**/api/portabilidade-historico**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(HISTORICO_MOCK),
    });
  });
}

async function gotoDisparos(page: Page) {
  await mockDisparosApis(page);
  await page.goto('/login');
  await injectAuth(page);
  await page.goto('/disparos');
  await page.waitForTimeout(1200);
}

test.describe('Disparos — smoke', () => {
  test('página carrega com modos operacional e gerencial', async ({ page }) => {
    await gotoDisparos(page);

    await expect(page.getByRole('tab', { name: 'Operacional' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Gerencial' })).toBeVisible();

    await page.getByRole('tab', { name: 'Gerencial' }).click();
    await expect(page.getByText(/Visão histórica · 3 meses/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Centro de Comando Gerencial/i)).toBeVisible({ timeout: 15000 });
  });

  test('funil operacional — cards e fatias exclusivas', async ({ page }) => {
    await gotoDisparos(page);

    await expect(page.getByRole('button', { name: /Atualizar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Funil operacional/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Taxa Portado \+ Falha/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Resultado exclusivo/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Funil de conversão/i)).toBeVisible({ timeout: 15000 });
  });

  test('gerencial — histórico replica funil', async ({ page }) => {
    await gotoDisparos(page);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('portabilidade-historico') && r.ok()),
      page.waitForResponse((r) => r.url().includes('portabilidade-funil') && r.ok()),
      page.getByRole('tab', { name: 'Gerencial' }).click(),
    ]);
    const secaoHistorico = page.locator('section').filter({ hasText: 'Visão histórica · 3 meses' });
    await expect(secaoHistorico.getByText(/✓ Histórico replica funil/i)).toBeVisible({ timeout: 20000 });
    await expect(secaoHistorico.getByText(/Histórico replica o funil gerencial deste mês/i)).toBeVisible();
  });

  test('gerencial — enqueue com mock API', async ({ page }) => {
    await page.route('**/api/portabilidade-enqueue', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          mensagem: 'consult enfileirado para 3F-12345678 (mock E2E).',
        }),
      });
    });

    await gotoDisparos(page);
    await page.getByRole('tab', { name: 'Gerencial' }).click();
    const cmd = page.locator('div').filter({ hasText: 'Comando · enfileirar na fila TIM' }).last();
    await expect(cmd).toBeVisible({ timeout: 15000 });

    await cmd.locator('input[placeholder="3F-12345678"]').fill('12345678');
    await cmd.locator('select').selectOption('consult');
    await cmd.getByRole('checkbox').check();

    const execBtn = cmd.getByRole('button', { name: /^Executar$/i });
    await expect(execBtn).toBeEnabled();
    await execBtn.click();

    await expect(page.getByText(/mock E2E/i)).toBeVisible({ timeout: 10000 });
  });

  test('gerencial — validação enqueue sem confirmar', async ({ page }) => {
    await gotoDisparos(page);
    await page.getByRole('tab', { name: 'Gerencial' }).click();
    const cmd = page.locator('div').filter({ hasText: 'Comando · enfileirar na fila TIM' }).last();
    await expect(cmd.locator('input[placeholder="3F-12345678"]')).toBeVisible({ timeout: 15000 });

    await cmd.locator('input[placeholder="3F-12345678"]').fill('3F-99999999');
    await expect(cmd.getByRole('button', { name: /^Executar$/i })).toBeDisabled();
  });
});
