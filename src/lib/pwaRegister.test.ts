import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForStaleChunk } from './pwaRegister';
import { ErrorBoundary } from '../components/ErrorBoundary';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('recuperação de chunk velho após deploy', () => {
  it('reconhece erros de import dinâmico dos navegadores', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/RrPage-x.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('recarrega uma única vez dentro da janela para não entrar em loop', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const t0 = 1_000_000;
    expect(reloadOnceForStaleChunk(storage, reload, t0)).toBe(true);
    expect(reloadOnceForStaleChunk(storage, reload, t0 + 5_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForStaleChunk(storage, reload, t0 + 31_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('recarrega mesmo sem storage disponível', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk(null, reload)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ErrorBoundary troca a mensagem técnica por orientação de recarregar', () => {
    const stale = ErrorBoundary.getDerivedStateFromError(
      new TypeError('Failed to fetch dynamically imported module: /assets/HoraPage-abc.js'),
    );
    expect(stale.staleChunk).toBe(true);
    expect(stale.message).toMatch(/nova versão/);
    const comum = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    expect(comum).toMatchObject({ staleChunk: false, message: 'boom' });
  });
});
