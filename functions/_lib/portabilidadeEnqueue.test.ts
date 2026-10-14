import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueueProposta, validarBodyEnqueue } from './portabilidadeEnqueue';

afterEach(() => vi.unstubAllGlobals());

describe('validarBodyEnqueue', () => {
  it.each([
    [null],
    [[]],
    ['x'],
    [{ proposta: 123, acao: 'consult', confirmar: true }],
    [{ acao: 1, confirmar: true }],
    [{ confirmar: 'true', proposta: '3F-1', acao: 'consult' }],
    [{ propostas: ['3F-1', 2], acao: 'consult', confirmar: true }],
    [{ propostas: '3F-1', acao: 'consult', confirmar: true }],
    [{ lote: [null], confirmar: true }],
    [{ lote: [{ proposta: 5, acao: 'consult' }], confirmar: true }],
    [{ lote: { proposta: '3F-1' }, confirmar: true }],
  ])('rejeita tipo errado → 400 (%j)', (raw) => {
    expect(validarBodyEnqueue(raw).ok).toBe(false);
  });

  it('aceita formatos válidos', () => {
    expect(validarBodyEnqueue({ proposta: '3F-1', acao: 'consult', confirmar: true }).ok).toBe(true);
    expect(validarBodyEnqueue({ propostas: ['3F-1'], acao: 'consult', confirmar: true }).ok).toBe(true);
    const r = validarBodyEnqueue({ lote: [{ proposta: '3F-1', acao: 'open' }], confirmar: true });
    expect(r.ok && r.body.lote?.[0]?.acao).toBe('open');
  });
});

const cfg = { url: 'https://port.test', key: 'k' };

type Rota = { ceExato?: unknown[]; ceLike?: unknown[]; filaPend?: unknown[]; filaCooldown?: unknown[] };

function stubSupabase(rota: Rota) {
  const inserts: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = decodeURIComponent(String(input));
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        inserts.push(body);
        return Response.json([{ id: 99 }], { status: 201 });
      }
      if (url.includes('consultas_enviadas_pos_aceite')) {
        return Response.json(url.includes('or=') ? rota.ceExato ?? [] : rota.ceLike ?? []);
      }
      if (url.includes('status=in.(pendente')) return Response.json(rota.filaPend ?? []);
      if (url.includes('status=eq.concluida')) return Response.json(rota.filaCooldown ?? []);
      return Response.json([]);
    }),
  );
  return inserts;
}

const ceOutra = {
  proposta_isize: '3F-912345',
  cpf: '11122233344',
  telefone: '11988887777',
  order_number: '1-999',
};

describe('enqueueProposta · match exato da proposta', () => {
  it('não usa CPF/telefone de outra proposta que só contém o número', async () => {
    const inserts = stubSupabase({ ceExato: [], ceLike: [ceOutra] });
    const r = await enqueueProposta({ cfg, propostaRaw: '12345', acao: 'consult', userEmail: 'a@b' });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(inserts).toHaveLength(0);
  });

  it('fallback like aceita variação de formato da mesma proposta', async () => {
    const inserts = stubSupabase({
      ceExato: [],
      ceLike: [ceOutra, { ...ceOutra, proposta_isize: ' 3f-12345 ', cpf: '55566677788' }],
    });
    const r = await enqueueProposta({ cfg, propostaRaw: '12345', acao: 'consult', userEmail: 'a@b' });
    expect(r.ok).toBe(true);
    expect(inserts[0]).toMatchObject({ proposta_isize: '12345', cpf: '55566677788' });
  });

  it('pendente de outra proposta não vira duplicata falsa', async () => {
    const inserts = stubSupabase({
      ceExato: [{ ...ceOutra, proposta_isize: '3F-12345' }],
      filaPend: [{ id: 7, status: 'pendente', acao: 'consult', proposta_isize: '912345' }],
    });
    const r = await enqueueProposta({ cfg, propostaRaw: '3F-12345', acao: 'consult', userEmail: 'a@b' });
    expect(r).toMatchObject({ ok: true, fila_id: 99 });
    expect(r.ok && r.duplicata).toBeFalsy();
    expect(inserts).toHaveLength(1);
  });

  it('pendente da mesma proposta continua sendo duplicata', async () => {
    const inserts = stubSupabase({
      ceExato: [{ ...ceOutra, proposta_isize: '3F-12345' }],
      filaPend: [{ id: 7, status: 'pendente', acao: 'consult', proposta_isize: '12345' }],
    });
    const r = await enqueueProposta({ cfg, propostaRaw: '12345', acao: 'consult', userEmail: 'a@b' });
    expect(r).toMatchObject({ ok: true, duplicata: true, fila_id: 7 });
    expect(inserts).toHaveLength(0);
  });

  it('cooldown só vale para a própria proposta', async () => {
    stubSupabase({
      ceExato: [{ ...ceOutra, proposta_isize: '3F-12345' }],
      filaCooldown: [{ id: 8, proposta_isize: '3F-12345' }],
    });
    const r = await enqueueProposta({ cfg, propostaRaw: '12345', acao: 'consult', userEmail: 'a@b' });
    expect(r).toMatchObject({ ok: false, status: 429 });
  });
});
