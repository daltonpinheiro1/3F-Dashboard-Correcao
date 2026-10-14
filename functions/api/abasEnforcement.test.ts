import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResult } from '../_lib/auth';
import { ABA_IDS, canAccessAbaFor } from '../../shared/abasCatalog';

const authAtual = vi.hoisted(() => ({ value: { ok: true, mode: 'secret' } as AuthResult }));
const rate = vi.hoisted(() => ({ ip: true, user: true }));

vi.mock('../_lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/auth')>()),
  authorizeRequest: vi.fn(async () => authAtual.value),
}));
vi.mock('../_lib/rateLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/rateLimit')>()),
  allowRateDistributed: vi.fn(async () => rate.ip),
  allowRateForUser: vi.fn(async () => rate.user),
}));

import * as cuboQuery from './cubo-query';
import * as cuboOverview from './cubo-overview';
import * as evaData from './eva-data';
import * as mailingIndice from './mailing-indice';
import * as mailingSaude from './mailing-saude';
import * as advertencias from './advertencias';
import * as advertenciaNarrativa from './advertencia-narrativa';
import * as atestados from './atestados';
import * as atestadoAnalise from './atestado-analise';
import * as atestadoArquivo from './atestado-arquivo';
import * as atestadoAudit from './atestado-audit';
import * as conciliacao from './conciliacao';
import * as copilot from './copilot';
import * as rrInsight from './rr-insight';
import * as horaInsight from './hora-insight';
import * as coaching from './coaching';
import * as whatIf from './what-if';
import * as riskRadar from './risk-radar';
import * as knowledgeSearch from './knowledge-search';

type Handler = (ctx: never) => Promise<Response>;

const env = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
};

const ATESTADOS = ['atestados', 'atestados-solicitar'];

type Caso = {
  nome: string;
  handler: Handler;
  method: string;
  path: string;
  body?: unknown;
  abas: readonly string[];
};

const CASOS: Caso[] = [
  {
    nome: 'cubo-query (correcao_logs)',
    handler: cuboQuery.onRequestPost as Handler,
    method: 'POST',
    path: '/api/cubo-query',
    body: { table: 'correcao_logs', select: ['proposta_id'] },
    abas: ['erros', 'evolucao', 'insights', 'operadores', 'sms'],
  },
  {
    nome: 'cubo-query (sms_eficiencia)',
    handler: cuboQuery.onRequestPost as Handler,
    method: 'POST',
    path: '/api/cubo-query',
    body: { table: 'sms_eficiencia', select: ['proposta_id'] },
    abas: ['evolucao', 'insights', 'operadores', 'sms'],
  },
  {
    nome: 'cubo-query (toutbox_entrega)',
    handler: cuboQuery.onRequestPost as Handler,
    method: 'POST',
    path: '/api/cubo-query',
    body: { table: 'toutbox_entrega', select: ['proposta_id'] },
    abas: ['evolucao', 'operadores', 'sms'],
  },
  {
    nome: 'cubo-overview',
    handler: cuboOverview.onRequestGet as Handler,
    method: 'GET',
    path: '/api/cubo-overview?de=2026-10-01&ate=2026-10-02',
    abas: ['dashboard', 'operadores', 'supervisores', 'insights'],
  },
  {
    nome: 'eva-data',
    handler: evaData.onRequestGet as Handler,
    method: 'GET',
    path: '/api/eva-data?live=1',
    abas: evaData.ABAS_EVA_DATA,
  },
  {
    nome: 'mailing-indice',
    handler: mailingIndice.onRequestGet as Handler,
    method: 'GET',
    path: '/api/mailing-indice',
    abas: ['mailing'],
  },
  {
    nome: 'mailing-saude',
    handler: mailingSaude.onRequestGet as Handler,
    method: 'GET',
    path: '/api/mailing-saude?live=1',
    abas: ['mailing', 'operacao'],
  },
  {
    nome: 'advertencias GET',
    handler: advertencias.onRequestGet as Handler,
    method: 'GET',
    path: '/api/advertencias?limit=1',
    abas: ['advertencias', 'controle-dp', 'atestados', 'atestados-solicitar', 'inteligencia'],
  },
  {
    nome: 'advertencias POST',
    handler: advertencias.onRequestPost as Handler,
    method: 'POST',
    path: '/api/advertencias',
    body: {},
    abas: ['advertencias'],
  },
  {
    nome: 'advertencia-narrativa',
    handler: advertenciaNarrativa.onRequestPost as Handler,
    method: 'POST',
    path: '/api/advertencia-narrativa',
    body: {},
    abas: ['advertencias'],
  },
  {
    nome: 'atestados GET',
    handler: atestados.onRequestGet as Handler,
    method: 'GET',
    path: '/api/atestados?limit=1',
    abas: ATESTADOS,
  },
  {
    nome: 'atestados POST',
    handler: atestados.onRequestPost as Handler,
    method: 'POST',
    path: '/api/atestados',
    body: {},
    abas: ATESTADOS,
  },
  {
    nome: 'atestado-analise',
    handler: atestadoAnalise.onRequestPost as Handler,
    method: 'POST',
    path: '/api/atestado-analise',
    body: {},
    abas: ATESTADOS,
  },
  {
    nome: 'atestado-arquivo',
    handler: atestadoArquivo.onRequestGet as Handler,
    method: 'GET',
    path: '/api/atestado-arquivo?id=abc',
    abas: ATESTADOS,
  },
  {
    nome: 'atestado-audit',
    handler: atestadoAudit.onRequestGet as Handler,
    method: 'GET',
    path: '/api/atestado-audit?id=abc',
    abas: ATESTADOS,
  },
  {
    nome: 'conciliacao',
    handler: conciliacao.onRequestGet as unknown as Handler,
    method: 'GET',
    path: '/api/conciliacao',
    abas: ['disparos', 'sms'],
  },
];

function sessao(role: string, abas: string[]): AuthResult {
  return {
    ok: true,
    mode: 'session',
    user: { id: 'u-1', email: 'u@3f.test', role, abas },
  };
}

function chamar(caso: Pick<Caso, 'handler' | 'method' | 'path' | 'body'>): Promise<Response> {
  const request = new Request(`https://dash.test${caso.path}`, {
    method: caso.method,
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.0.1' },
    body: caso.body === undefined ? undefined : JSON.stringify(caso.body),
  });
  return caso.handler({ request, env } as never);
}

async function bloqueadoPorAba(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res.clone().json().catch(() => ({}))) as { error?: string };
  return /Acesso restrito à(s)? aba/i.test(String(body.error || ''));
}

function abaFora(abas: readonly string[]): string {
  const fora = ABA_IDS.find((a) => !abas.includes(a) && a !== 'administracao');
  if (!fora) throw new Error('sem aba fora');
  return fora;
}

beforeEach(() => {
  rate.ip = true;
  rate.user = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([])),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  authAtual.value = { ok: true, mode: 'secret' };
});

describe.each(CASOS)('abas · $nome', (caso) => {
  it('perfil sem nenhuma das abas → 403', async () => {
    authAtual.value = sessao('viewer', [abaFora(caso.abas)]);
    const res = await chamar(caso);
    expect(res.status).toBe(403);
    expect(await bloqueadoPorAba(res)).toBe(true);
  });

  it.each(caso.abas.map((aba) => [aba]))('perfil com a aba %s → não bloqueia', async (aba) => {
    authAtual.value = sessao('viewer', [aba]);
    const res = await chamar(caso);
    expect(await bloqueadoPorAba(res)).toBe(false);
    expect(res.status).not.toBe(401);
  });

  it.each([['viewer'], ['supervisor'], ['operador']])('sem perfil segue o papel (%s)', async (role) => {
    authAtual.value = sessao(role, []);
    const esperado = caso.abas.some((aba) => canAccessAbaFor({ role, abas: [] }, aba));
    const res = await chamar(caso);
    if (esperado) expect(await bloqueadoPorAba(res)).toBe(false);
    else expect(res.status).toBe(403);
  });

  it('admin com perfil sem a aba passa', async () => {
    authAtual.value = sessao('admin', [abaFora(caso.abas)]);
    expect(await bloqueadoPorAba(await chamar(caso))).toBe(false);
  });

  it('secret passa', async () => {
    authAtual.value = { ok: true, mode: 'secret' };
    expect(await bloqueadoPorAba(await chamar(caso))).toBe(false);
  });
});

describe('abas · retrocompatibilidade sem perfil', () => {
  it('viewer sem perfil mantém acesso a todos os endpoints antes liberados por requireGestao', async () => {
    for (const caso of CASOS.filter((c) => c.nome !== 'conciliacao')) {
      authAtual.value = sessao('viewer', []);
      expect(await bloqueadoPorAba(await chamar(caso)), caso.nome).toBe(false);
    }
  });

  it('cubo-query: aba de uma tabela não libera outra', async () => {
    authAtual.value = sessao('viewer', ['erros']);
    const ok = await chamar(CASOS[0]);
    expect(await bloqueadoPorAba(ok)).toBe(false);
    const negado = await chamar(CASOS[1]);
    expect(negado.status).toBe(403);
  });

  it('PATCH advertências e atestados segue exclusivo de admin', async () => {
    authAtual.value = sessao('viewer', ['advertencias', 'atestados']);
    for (const handler of [advertencias.onRequestPatch, atestados.onRequestPatch] as Handler[]) {
      const res = await chamar({ handler, method: 'PATCH', path: '/api/x', body: {} });
      expect(res.status).toBe(403);
    }
  });
});

type CasoRate = { nome: string; handler: Handler; method: string; path: string; body?: unknown };

const CASOS_RATE_USUARIO: CasoRate[] = [
  { nome: 'copilot', handler: copilot.onRequestPost as Handler, method: 'POST', path: '/api/copilot', body: { question: 'x' } },
  { nome: 'rr-insight', handler: rrInsight.onRequestPost as Handler, method: 'POST', path: '/api/rr-insight', body: {} },
  { nome: 'hora-insight', handler: horaInsight.onRequestPost as Handler, method: 'POST', path: '/api/hora-insight', body: {} },
  { nome: 'advertencia-narrativa', handler: advertenciaNarrativa.onRequestPost as Handler, method: 'POST', path: '/api/advertencia-narrativa', body: {} },
  { nome: 'atestado-analise', handler: atestadoAnalise.onRequestPost as Handler, method: 'POST', path: '/api/atestado-analise', body: {} },
  { nome: 'coaching GET', handler: coaching.onRequestGet as Handler, method: 'GET', path: '/api/coaching' },
  { nome: 'coaching POST', handler: coaching.onRequestPost as Handler, method: 'POST', path: '/api/coaching', body: {} },
  { nome: 'coaching PATCH', handler: coaching.onRequestPatch as Handler, method: 'PATCH', path: '/api/coaching?id=1', body: {} },
  { nome: 'what-if', handler: whatIf.onRequestPost as Handler, method: 'POST', path: '/api/what-if', body: {} },
  { nome: 'risk-radar', handler: riskRadar.onRequestPost as Handler, method: 'POST', path: '/api/risk-radar', body: {} },
  { nome: 'knowledge-search', handler: knowledgeSearch.onRequestGet as Handler, method: 'GET', path: '/api/knowledge-search?q=x' },
  { nome: 'conciliacao', handler: conciliacao.onRequestGet as unknown as Handler, method: 'GET', path: '/api/conciliacao' },
];

describe.each(CASOS_RATE_USUARIO)('rate limit por usuário · $nome', (caso) => {
  it('estouro do limite do usuário → 429 mesmo com IP liberado', async () => {
    authAtual.value = sessao('admin', []);
    rate.user = false;
    const res = await chamar(caso);
    expect(res.status).toBe(429);
  });

  it('limite por IP continua valendo', async () => {
    authAtual.value = sessao('admin', []);
    rate.ip = false;
    const res = await chamar(caso);
    expect(res.status).toBe(429);
  });
});

describe('hora-insight · modelo por env', () => {
  it('usa OPENAI_MODEL_REASONING em vez do modelo fixo', async () => {
    authAtual.value = { ok: true, mode: 'secret' };
    const bodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        bodies.push(String(init?.body || ''));
        return Response.json({ choices: [{ message: { content: 'ok' } }] });
      }),
    );
    const request = new Request('https://dash.test/api/hora-insight', {
      method: 'POST',
      body: JSON.stringify({ meta_dia: 65 }),
    });
    const res = await horaInsight.onRequestPost({
      request,
      env: { ...env, OPENAI_API_KEY: 'sk-test', OPENAI_MODEL_REASONING: 'gpt-test-reasoning' },
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(bodies[0]).model).toBe('gpt-test-reasoning');
  });
});
