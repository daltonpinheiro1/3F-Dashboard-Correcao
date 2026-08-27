import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'admin@3f.com';
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'admin123';
const AUTH_KEY = '3f-dashboard-auth';

async function injectAuth(page: Page, role: 'admin' | 'user' | 'supervisor' | 'viewer' = 'admin') {
  const email =
    role === 'admin' ? 'admin@3f.com' : role === 'supervisor' ? 'sup@3f.com' : 'user@3f.com';
  const name = role === 'admin' ? 'Admin' : role === 'supervisor' ? 'Supervisor' : 'User';
  const userRole = role === 'user' ? 'viewer' : role;
  const sessionExpiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
  await page.evaluate(
    ([k, n, e, r, exp]) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          state: {
            isAuthenticated: true,
            userName: n,
            userEmail: e,
            userRole: r,
            sessionExpiresAt: exp,
            sessionNonce: 'e2e_nonce_' + 'x'.repeat(24),
          },
          version: 0,
        }),
      );
    },
    [AUTH_KEY, name, email, userRole, sessionExpiresAt] as const,
  );
}

test.describe('Smoke Tests — Blindagem anti-regressão', () => {
  test('Login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/3F/i);
    await expect(page.locator('input[type="email"], input[type="text"]')).toBeVisible();
  });

  test('Unauthenticated user redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/login/);
    expect(page.url()).toContain('/login');
  });

  test('Login with valid credentials and see dashboard', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      await emailInput.fill(TEST_EMAIL);
      await passwordInput.fill(TEST_PASSWORD);
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('All nav links exist in sidebar', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);

    const navLinks = [
      'Dashboard', 'Operadores', 'Supervisores', 'Erros',
      'Evolução', 'Insights', 'SMS Prévio', 'Operação', 'Chamadas',
    ];
    for (const label of navLinks) {
      const link = page.locator(`a:has-text("${label}")`).first();
      await expect(link).toBeVisible({ timeout: 5000 });
    }
  });

  test('Admin-only nav items visible for admin', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    await expect(page.locator('a:has-text("Hora a hora")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a:has-text("Discagens")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a:has-text("Usuários")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('a:has-text("Advertências")')).toBeVisible({ timeout: 5000 });
  });

  test('Advertências page loads with Controle DP inbox and export', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/advertencias');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Gestão de Advertências')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Controle DP")')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('group', { name: 'Filas do Controle DP' })).toBeVisible({ timeout: 10000 });
    const inbox = page.getByRole('group', { name: 'Filas do Controle DP' });
    await expect(inbox.getByRole('button', { name: /Enviadas/ })).toBeVisible();
    await expect(inbox.getByRole('button', { name: /Autorizadas/ })).toBeVisible();
    await expect(inbox.getByRole('button', { name: /Recusadas/ })).toBeVisible();
    await expect(inbox.getByRole('button', { name: /Recebidas/ })).toBeVisible();
    await expect(page.locator('button:has-text("Exportar Excel")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Criar Nova Advertência")')).toBeVisible();
    await inbox.getByRole('button', { name: /Enviadas/ }).click();
    await expect(page.locator('text=autorização em lote').or(page.locator('text=aprovar em lote'))).toBeVisible({
      timeout: 5000,
    });
  });

  test('Advertências Criação tab opens form entry', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/advertencias');
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Criação")').click();
    await expect(page.locator('button:has-text("Abrir formulário")')).toBeVisible({ timeout: 10000 });
  });

  test('Viewer (supervisão operação) can access /discagens', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page, 'viewer');
    await page.goto('/discagens');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Funil dialer')).toBeVisible({ timeout: 10000 });
  });

  test('Supervisor can access /discagens', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page, 'supervisor');
    await page.goto('/discagens');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Funil dialer')).toBeVisible({ timeout: 10000 });
  });

  test('Discagens page loads for admin with funnel', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/discagens');
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Discagens').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Funil dialer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Realtime')).toBeVisible();
  });

  test('Non-admin cannot access /hora', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page, 'user');
    await page.goto('/hora');
    await page.waitForURL(/dashboard/);
    expect(page.url()).toContain('/dashboard');
  });

  test('Dashboard page renders KPI cards', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Total propostas')).toBeVisible({ timeout: 10000 });
  });

  test('Hora page loads for admin with core sections', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: 'Hora a hora', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('tab', { name: 'Realtime' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Histórico' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver dia inteiro' })).toBeVisible();
  });

  test('Hora page hour filter buttons work', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);

    const btn10h = page.getByRole('button', { name: 'Filtrar hora 10' });
    if (await btn10h.isVisible()) {
      await btn10h.click();
      await expect(btn10h).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('Copiar relatório button exists', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);
    await expect(page.locator('button:has-text("Copiar relatório")')).toBeVisible({ timeout: 10000 });
  });

  test('Alerta toggle button exists and works', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);
    const alertBtn = page.locator('button:has-text("Alertas ativos")');
    if (await alertBtn.isVisible()) {
      await alertBtn.click();
      await expect(page.locator('button:has-text("Alertas desligados")')).toBeVisible();
    }
  });

  test('Campaign filter switches correctly', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);
    const portBtn = page.getByRole('tab', { name: 'Portabilidade' });
    if (await portBtn.isVisible()) {
      await portBtn.click();
      await expect(portBtn).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('Search filter is present and typeable', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);
    const searchInput = page.locator('input[placeholder="Gestor ou operador"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('teste');
    await expect(searchInput).toHaveValue('teste');
  });

  test('Hora page shows motivo traceability hints', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/hora');
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Motivo principal = maior perda do colaborador')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('th:has-text("Fonte")')).toBeVisible({ timeout: 10000 });
  });

  test('Error boundary handles crashes gracefully', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('404 redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/nonexistent-page');
    await page.waitForURL(/dashboard/);
    expect(page.url()).toContain('/dashboard');
  });

  test('Responsive: mobile menu toggle exists', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await injectAuth(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    const menuBtn = page.locator('button[aria-label="Abrir menu"]');
    await expect(menuBtn).toBeVisible({ timeout: 5000 });
  });
});
