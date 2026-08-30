import { describe, expect, it } from 'vitest';
import {
  buildProjecaoMes,
  detectarOportunidades,
  diasMesBrt,
  serieTendencia,
} from './portabilidadeProjecoes';
import type { HistoricoPonto } from '../types/portabilidade';

const serie: HistoricoPonto[] = [
  {
    mes: '2026-06',
    portados: 700,
    falha_parcial: 150,
    canceladas: 400,
    fechados: 1250,
    quebras: 80,
    bko: 90,
    execucoes: 5000,
    activate_ok: 600,
    taxa_portado_pct: 11,
    taxa_sucesso_fila_pct: 92,
  },
  {
    mes: '2026-07',
    portados: 680,
    falha_parcial: 140,
    canceladas: 420,
    fechados: 1240,
    quebras: 90,
    bko: 100,
    execucoes: 4800,
    activate_ok: 580,
    taxa_portado_pct: 10.5,
    taxa_sucesso_fila_pct: 91,
  },
];

describe('diasMesBrt', () => {
  it('calcula dias do mês', () => {
    const d = diasMesBrt('2026-08', new Date('2026-08-29T15:00:00Z'));
    expect(d.total).toBe(31);
    expect(d.decorridos).toBe(29);
    expect(d.restantes).toBe(2);
  });
});

describe('buildProjecaoMes', () => {
  it('retorna projeção com cenários', () => {
    const p = buildProjecaoMes({
      mes: '2026-08',
      g: {
        portados: 753,
        falha_parcial: 165,
        sucesso_tim: 918,
        fechados: 3424,
        bko: 797,
        quebras: 439,
        taxa_sucesso_tim_pct: 14,
      },
      rec: { universo: 6558, em_voo: 3134, fechados: 3424, soma_fatias: 6558, fecha: true, orfaos: 0 },
      serie,
      agora: new Date('2026-08-29T15:00:00Z'),
    });
    expect(p).not.toBeNull();
    expect(p!.cenarios.realista.sucessoTim).toBeGreaterThanOrEqual(918);
    expect(p!.cenarios.otimista.sucessoTim).toBeGreaterThanOrEqual(p!.cenarios.pessimista.sucessoTim);
    expect(p!.monteCarlo.p50).toBeGreaterThan(0);
  });

  it('monte carlo é determinístico para mesmo recorte', () => {
    const opts = {
      mes: '2026-08',
      g: { portados: 100, falha_parcial: 20, sucesso_tim: 120, fechados: 200, bko: 10 },
      rec: { universo: 500, em_voo: 300, fechados: 200, soma_fatias: 500, fecha: true, orfaos: 0 },
      serie,
      agora: new Date('2026-08-15T12:00:00Z'),
    };
    const a = buildProjecaoMes(opts);
    const b = buildProjecaoMes(opts);
    expect(a!.monteCarlo.p50).toBe(b!.monteCarlo.p50);
  });
});

describe('detectarOportunidades', () => {
  it('detecta BKO e ticket aberto', () => {
    const ops = detectarOportunidades({
      g: { bko: 797, quebras: 439, taxa_quebra_pct: 6.7, taxa_sucesso_tim_pct: 14 },
      rec: { universo: 6558, em_voo: 3134, fechados: 3424, soma_fatias: 6558, fecha: true, orfaos: 0 },
      funil: {
        funil_pontes: { sem_os: 144, os_sem_ticket: 144, ticket_nao_fechado: 1102 },
        fatias: [{ id: 'bko', label: 'BKO', grupo: 'fila', cor: 'amber', descricao: '', count: 797, pct: 12 }],
      },
    });
    expect(ops.some((o) => o.id === 'bko_alto')).toBe(true);
    expect(ops.some((o) => o.id === 'ticket_aberto')).toBe(true);
  });
});

describe('serieTendencia', () => {
  it('ordena cronologicamente (mais antigo primeiro)', () => {
    const t = serieTendencia(serie);
    expect(t[0].mes).toBe('06');
    expect(t[1].mes).toBe('07');
    expect(t[0].sucessoTim).toBe(850);
  });
});
