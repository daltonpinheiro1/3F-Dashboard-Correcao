import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/integration',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'https://127.0.0.1:4174',
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/e2e-upstream.mjs',
      url: 'http://127.0.0.1:8790/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        'npm run build && wrangler pages dev dist --ip 127.0.0.1 --port 4174 --local-protocol https --binding SUPABASE_URL=http://127.0.0.1:8790 --binding SUPABASE_SERVICE_KEY=e2e-service-key --binding ALLOW_LEGACY_SESSION_HEADERS=true',
      url: 'https://127.0.0.1:4174/login',
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { channel: 'chrome' } }],
});
