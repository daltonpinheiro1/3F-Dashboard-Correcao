import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dashboardSession', () => ({
  dashboardSessionHeaders: () => ({ 'Content-Type': 'application/json' }),
  hasDashboardSession: () => true,
}));

import { dataBrtIso } from './brt';
import { fetchEvaDia, isEvaDbDown } from './evaDash';

describe('isEvaDbDown', () => {
  it('detecta down case-insensitive', () => {
    expect(isEvaDbDown({ eva_db: 'down' })).toBe(true);
    expect(isEvaDbDown({ eva_db: 'DOWN' })).toBe(true);
    expect(isEvaDbDown({ eva_db: 'ok' })).toBe(false);
    expect(isEvaDbDown(undefined)).toBe(false);
  });
});

describe('fetchEvaDia — contrato live vs faltando', () => {
  const hoje = dataBrtIso();
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('propaga erro HTTP do live do dia aberto (não vira null/faltando)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    });
    const p = fetchEvaDia(hoje);
    const assertion = expect(p).rejects.toThrow(/401|Falha ao carregar|Sessão/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('retorna null em hist 404/400 (dia realmente ausente)', async () => {
    const passado = '2026-11-20';
    expect(passado).not.toBe(hoje);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ statusCode: '404', code: 'NoSuchKey' }),
    });
    await expect(fetchEvaDia(passado)).resolves.toBeNull();
  });

  it('não usa .catch(() => null) no caminho live (regressão zeros silenciosos)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./evaDash.ts', import.meta.url), 'utf8');
    expect(src).toContain('fetchEvaLive(signal).then((p) =>');
    expect(src).not.toMatch(/fonteDoDia\(dia\) === 'live'[\s\S]{0,200}\.catch\(\(\) => null\)/);
  });
});
