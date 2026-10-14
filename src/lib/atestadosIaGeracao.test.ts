import { describe, expect, it } from 'vitest';
import { criarContadorGeracao } from './atestadosIaGeracao';

describe('atestadosIaGeracao', () => {
  it('análise antiga que termina depois da nova é descartada', async () => {
    const g = criarContadorGeracao();
    const aplicados: string[] = [];
    const analisar = async (nome: string, ms: number) => {
      const gen = g.nova();
      await new Promise((r) => setTimeout(r, ms));
      if (g.vigente(gen)) aplicados.push(nome);
    };
    await Promise.all([analisar('arquivo-A', 20), analisar('arquivo-B', 1)]);
    expect(aplicados).toEqual(['arquivo-B']);
  });

  it('invalidar (protocolo concluído/limpeza) descarta análise em voo', () => {
    const g = criarContadorGeracao();
    const gen = g.nova();
    g.invalidar();
    expect(g.vigente(gen)).toBe(false);
  });
});
