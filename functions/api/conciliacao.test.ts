import { afterEach, describe, expect, it, vi } from 'vitest';
import { contarDivida } from './conciliacao';

afterEach(() => vi.unstubAllGlobals());

const env = {
  PORTABILIDADE_SUPABASE_URL: 'https://port.test/',
  PORTABILIDADE_SUPABASE_SERVICE_KEY: 'service-key',
} as Parameters<typeof contarDivida>[0];

function linhas(n: number, inicio: number, status: string) {
  return Array.from({ length: n }, (_, i) => ({ proposta_isize: `P${inicio + i}`, status }));
}

describe('contarDivida', () => {
  it('pagina além das 1000 linhas do PostgREST', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('offset=0&')) return Response.json(linhas(1000, 0, 'concluida'));
      if (url.includes('offset=1000&')) return Response.json(linhas(250, 1000, 'pendente'));
      return Response.json([]);
    }));
    const r = await contarDivida(env);
    expect(r).toEqual({ consultas: 1250, concluidas: 1000, pendentes: 250, falhas: 0 });
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('order=id.asc');
  });

  it('falha numa página no meio não devolve contagem parcial', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('offset=0&')) return Response.json(linhas(1000, 0, 'concluida'));
      return new Response('erro', { status: 500 });
    }));
    await expect(contarDivida(env)).resolves.toBeNull();
  });

  it('sem credencial não consulta', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(contarDivida({} as typeof env)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
