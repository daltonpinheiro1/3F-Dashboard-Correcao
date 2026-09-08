import { test, expect, type Page } from '@playwright/test';

const AUTH_KEY = '3f-dashboard-auth';
const BASE = process.env.E2E_BASE_URL;

if (BASE) {
  test.use({ baseURL: BASE });
}

async function injectAuth(page: Page) {
  const sessionExpiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
  await page.goto('/login');
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

test.describe('Passe autenticado RR + matriz horas', () => {
  test('RR abre com frase da casa, pódio e TV no slide Casa', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/rr');
    await expect(page.getByText('Frase da casa').first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Pódio · puxam a fila/)).toBeVisible();
    await expect(page.getByText(/Banco · não repetir o turno/)).toBeVisible();

    await page.getByRole('button', { name: /War room TV/i }).click();
    const tv = page.getByRole('dialog', { name: 'War room RR' });
    await expect(tv).toBeVisible({ timeout: 15_000 });
    await expect(tv.getByRole('button', { name: 'Casa' })).toHaveClass(/bg-white/);
    await expect(tv.getByText('Frase da casa').first()).toBeVisible();
    await tv.screenshot({ path: 'test-results/passe-rr-tv-casa.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /War room TV/i })).toBeVisible();
  });

  test('Discagens: cada hora ordena maior→menor e o inverso', async ({ page }) => {
    await injectAuth(page);
    await page.goto('/discagens');
    const card = page.locator('.card').filter({
      has: page.getByRole('heading', { name: /Tabulações × Hora/ }),
    });
    await expect(card).toBeVisible({ timeout: 25_000 });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('tab', { name: '% na hora' })).toBeVisible();

    const horaTh = card.locator('thead th').filter({ hasText: /^10h$/ });
    await horaTh.getByRole('button').click();
    await expect(horaTh).toHaveAttribute('aria-sort', 'descending');
    await horaTh.getByRole('button').click();
    await expect(horaTh).toHaveAttribute('aria-sort', 'ascending');
    await card.screenshot({ path: 'test-results/passe-discagens-hora.png' });

    await card.getByRole('tab', { name: 'Quantidade' }).click();
    await expect(card.locator('thead').getByRole('button', { name: '10h' })).toBeVisible();
    await card.getByRole('tab', { name: 'DROP%' }).click();
    await expect(card.locator('thead').getByRole('button', { name: '10h' })).toBeVisible();
    await card.getByRole('tab', { name: 'TMA' }).click();
    await expect(card.locator('thead').getByRole('button', { name: '10h' })).toBeVisible();
  });
});
