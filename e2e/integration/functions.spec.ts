import { expect, test } from '@playwright/test';

test('login, cookie HttpOnly, cubo e EVA passam pelas Pages Functions reais', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@3f.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('e2e-password');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === '__Host-3f-dashboard-session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);

  const cubo = await page.request.post('/api/cubo-query', {
    data: {
      table: 'correcao_logs',
      select: ['id', 'proposta_id', 'tipos_erro'],
      from: 0,
      to: 9,
    },
  });
  expect(cubo.status()).toBe(200);
  expect(cubo.headers()['x-request-id']).toBeTruthy();
  expect(cubo.headers()['server-timing']).toMatch(/^app;dur=/);
  await expect(cubo.json()).resolves.toMatchObject({
    rows: [{ proposta_id: 'PROP-E2E' }],
  });

  const eva = await page.request.get('/api/eva-data?live=1');
  expect(eva.status()).toBe(200);
  await expect(eva.json()).resolves.toMatchObject({
    data: '2026-09-09',
    kpis_chamadas: { tabuladas: 1 },
  });
});
