import { describe, expect, it } from 'vitest';
import { esperaNoSlot, fecharMediasHora, horaChave, mediaGeralHora, medirOciosidade } from './ociosidade';
import type { EvaJornada } from './evaDash';

function j(partial: Partial<EvaJornada>): EvaJornada {
  return {
    id_user: 1,
    user_name: 'Ana',
    login: 'ana',
    supervisor_name: 'Sarah',
    campaign_name: 'Port',
    date_login: '2026-09-22T09:00:00',
    date_logout: null,
    logins: 1,
    logged_time: 3600,
    paused_time: 0,
    ...partial,
  };
}

describe('esperaNoSlot', () => {
  it('lê a espera pela hora do slot e ignora hora vazia', () => {
    const porHora = new Map([['09', 3600]]);
    expect(horaChave(9)).toBe('09');
    expect(horaChave('')).toBe('');
    expect(esperaNoSlot('09:10', porHora)).toBe(3600);
    expect(esperaNoSlot('10:00', porHora)).toBeNull();
  });
});

describe('mediaGeralHora', () => {
  it('divide a soma ociosa da hora pelos atendimentos, como os 16m do supervisor', () => {
    expect(mediaGeralHora(40 * 3600, 150)).toBeCloseTo(16 * 60, 5);
    expect(mediaGeralHora(40 * 3600, 0)).toBeNull();
  });
});

describe('fecharMediasHora', () => {
  it('a média ponderada das horas fecha na espera média do time', () => {
    const esperaDia = 16 * 60 * 40;
    const chamadasDia = 40;
    const horas = fecharMediasHora(
      [
        { hora: 9, espera: 3 * 60 * 10, chamadas: 10 },
        { hora: 10, espera: 5 * 60 * 20, chamadas: 20 },
        { hora: 12, espera: 30 * 60 * 10, chamadas: 10 },
      ],
      esperaDia,
      chamadasDia,
    );
    const peso = [...horas.values()].reduce((s, h) => s + h.chamadas, 0);
    const media = [...horas.values()].reduce((s, h) => s + h.media * h.chamadas, 0) / peso;
    expect(media).toBeCloseTo(esperaDia / chamadasDia, 5);
    expect(horas.get(12)!.media).toBeGreaterThan(horas.get(9)!.media);
  });
});

describe('medirOciosidade', () => {
  it('mede a espera entre ligações e a venda que cabia nesse tempo', () => {
    const out = medirOciosidade([
      j({
        available_time: 1200,
        working_time: 1800,
        classifying_time: 300,
        logged_time: 3600,
        chamadas: 10,
        tabuladas: 10,
        sucesso: 2,
        tma_seg: 120,
      }),
    ]);
    expect(out.medido).toBe(true);
    expect(out.espera).toBe(1500);
    expect(out.falando).toBe(1800);
    expect(out.tabulando).toBe(300);
    expect(out.espera + out.falando + out.tabulando).toBe(out.base);
    expect(out.base).toBe(3600);
    expect(out.intervaloMedio).toBe(150);
    expect(out.pct).toBeCloseTo(41.7, 0);
    expect(out.vales).toBeNull();
  });

  it('soma jornadas diferentes e não reduz a um único registro', () => {
    const a = j({ available_time: 600, working_time: 600, logged_time: 1200, chamadas: 4, tma_seg: 60, tabuladas: 4, sucesso: 0, campanha_op: 'PORTABILIDADE' });
    const b = j({ available_time: 600, working_time: 600, logged_time: 1200, chamadas: 4, tma_seg: 60, tabuladas: 4, sucesso: 0, campanha_op: 'MIGRACAO' });
    const out = medirOciosidade([a, b]);
    expect(out.espera).toBe(1200);
    expect(out.operadores).toBe(1);
    expect(out.chamadas).toBe(8);
  });

  it('tira pausa e relogin da espera e pondera pelo tempo útil', () => {
    const out = medirOciosidade([
      j({
        available_time: 2000,
        working_time: 1000,
        classifying_time: 0,
        logged_time: 4000,
        pausa_seg: 1000,
        tempo_perdido_seg: 500,
        chamadas: 10,
        tabuladas: 10,
        sucesso: 0,
        tma_seg: 100,
      }),
    ]);
    expect(out.espera).toBe(1500);
    expect(out.pausa).toBe(1000);
    expect(out.relogin).toBe(500);
    expect(out.base).toBe(2500);
    expect(out.pct).toBe(60);
    expect(out.vales).toBeNull();
  });

  it('soma os vãos acima de 45s de cada jornada e pondera a média do supervisor', () => {
    const a = j({
      available_time: 900,
      working_time: 900,
      logged_time: 1800,
      chamadas: 2,
      vales_45: 2,
      user_name: 'Vic',
      login: 'vic',
      supervisor_name: 'Sarah',
    });
    const b = j({
      available_time: 100,
      working_time: 1700,
      logged_time: 1800,
      chamadas: 10,
      vales_45: 1,
      id_user: 2,
      user_name: 'Lia',
      login: 'lia',
      supervisor_name: 'Sarah',
    });
    const out = medirOciosidade([a, b]);
    expect(out.vales).toBe(3);
    expect(out.intervaloMedio).toBeCloseTo(1000 / 12, 5);
    expect(out.porSupervisor).toHaveLength(1);
    expect(out.porSupervisor[0].intervaloMedio).toBeCloseTo(1000 / 12, 5);
    expect(out.porSupervisor[0].vales).toBe(3);
    expect(out.porSupervisor[0].operadores).toBe(2);
  });

  it('desconta uma vez a pausa e as ligações do dia repetidas em cada campanha', () => {
    const comum = { pausa_seg: 1000, tempo_perdido_seg: 200, chamadas: 10 };
    const out = medirOciosidade([
      j({
        ...comum,
        campanha_op: 'PORTABILIDADE',
        logged_time: 3000,
        available_time: 800,
        working_time: 1000,
        vales_45: 2,
      }),
      j({
        ...comum,
        campanha_op: 'MIGRACAO',
        logged_time: 2000,
        available_time: 400,
        working_time: 600,
        vales_45: 1,
      }),
    ]);
    expect(out.espera).toBe(2200);
    expect(out.falando).toBe(1600);
    expect(out.espera + out.falando).toBe(out.base);
    expect(out.pausa).toBe(1000);
    expect(out.relogin).toBe(200);
    expect(out.base).toBe(3800);
    expect(out.chamadas).toBe(10);
    expect(out.intervaloMedio).toBe(220);
    expect(out.vales).toBe(3);
    expect(out.operadores).toBe(1);
    expect(out.porOperador).toHaveLength(1);
  });

  it('fecha falado, ocioso, pós-tab e discagem na base, sem ocioso negativo', () => {
    const out = medirOciosidade([
      j({
        working_time: 1000,
        classifying_time: 200,
        dialing_time: 100,
        logged_time: 3600,
        pausa_seg: 300,
        tempo_perdido_seg: 200,
        chamadas: 8,
      }),
    ]);
    expect(out.base).toBe(3100);
    expect(out.espera).toBe(1800);
    expect(out.espera + out.falando + out.tabulando + out.porOperador[0].discando).toBe(out.base);
    const estoura = medirOciosidade([
      j({ working_time: 5000, classifying_time: 100, dialing_time: 50, logged_time: 3600, chamadas: 4 }),
    ]);
    expect(estoura.espera).toBe(0);
    expect(estoura.medido).toBe(true);
  });

  it('sem tempo disponível não inventa perda', () => {
    const out = medirOciosidade([j({ logged_time: 100 })]);
    expect(out.medido).toBe(false);
    expect(out.vales).toBeNull();
  });
});
