/**
 * cpcOverlay.regressao — contrato Pulse Discagens vs CPC casa.
 * Não misturar CPC nativo do dialer (~1,8%) com CPC EVA (supervisor/operador).
 */
import { describe, expect, it } from 'vitest';
import {
  applyCpcTabulacaoHumana,
  overlayCpcTabulacaoHumana,
  resolveDiscagens,
} from './evaDash';
import { cpcOperacional, kpisVolumeChamadas } from './chamadasVisoes';
import { mergeDiscagens } from '../pages/DiscagensPage';
import type { EvaPayload } from './evaDash';

describe('cpcOverlay.regressao', () => {
  it('Pulse: 109 CPC dialer + supervisor EVA vira CPC% da casa (÷ tabs do KPI)', () => {
    const disc = resolveDiscagens({
      kpis_chamadas: { tabuladas: 60_640, cpc: 8590 },
      discagens: {
        kpis: {
          dialed: 60_000,
          contact: 8_000,
          tabuladas: 60_640,
          cpc: 109,
          sucesso: 200,
          contact_rate: 13.3,
          cpc_rate: 1.8,
          efficacy: 0.3,
        },
        serie_hora: [
          {
            hora: '10',
            dialed: 60_000,
            contact: 8_000,
            tabuladas: 60_640,
            cpc: 109,
            sucesso: 200,
          },
        ],
        por_supervisor: [
          {
            supervisor_name: 'Caroline',
            operadores: 20,
            tabuladas: 40_000,
            cpc: 6960,
            sucesso: 120,
            cpc_rate: 17.4,
            conv_tab: 0.3,
          },
          {
            supervisor_name: 'Gislane',
            operadores: 15,
            tabuladas: 20_640,
            cpc: 1630,
            sucesso: 80,
            cpc_rate: 7.9,
            conv_tab: 0.4,
          },
        ],
      },
    } as unknown as EvaPayload);

    expect(disc.kpis.cpc).toBe(8590);
    expect(disc.kpis.cpc_rate).toBe(14.2);
    expect(disc.kpis.dialed).toBe(60_000);
    expect(disc.kpis.contact).toBe(8_000);
    expect(disc.kpis.tabuladas).toBe(60_640);
    expect(disc.kpis.sucesso).toBe(200);
  });

  it('não rebaixa CPC quando o nativo já está no contrato EVA', () => {
    const kpis = { cpc: 8000, cpc_rate: 13.2, tabuladas: 60_640, dialed: 60_000 };
    const out = overlayCpcTabulacaoHumana(kpis, {
      por_supervisor: [{ cpc: 8000, tabuladas: 60_640 }],
    });
    expect(out.cpc).toBe(8000);
    expect(out).toBe(kpis);
  });

  it('não inventa overlay sem volume humano', () => {
    const kpis = { cpc: 109, cpc_rate: 1.8, tabuladas: 60_640 };
    const out = overlayCpcTabulacaoHumana(kpis, { por_supervisor: [] });
    expect(out.cpc).toBe(109);
  });

  it('histórico soma o CPC já overlayado e não volta ao dialer', () => {
    const dia = (cpcNative: number, cpcHuman: number): EvaPayload =>
      ({
        discagens: {
          fonte: 'mailing_dial_details',
          kpis: {
            dialed: 10_000,
            contact: 2_000,
            tabuladas: 10_000,
            cpc: cpcNative,
            sucesso: 50,
            contact_rate: 20,
            cpc_rate: 1.1,
            efficacy: 0.5,
          },
          por_supervisor: [
            {
              supervisor_name: 'Caroline',
              operadores: 10,
              tabuladas: 10_000,
              cpc: cpcHuman,
              sucesso: 50,
              cpc_rate: 13.7,
              conv_tab: 0.5,
            },
          ],
        },
      }) as unknown as EvaPayload;

    const merged = mergeDiscagens([dia(109, 1370), dia(80, 1400)]);
    expect(merged.kpis.cpc).toBe(2770);
    expect(merged.kpis.tabuladas).toBe(20_000);
    expect(merged.kpis.cpc_rate).toBe(13.9);
    expect(merged.kpis.dialed).toBe(20_000);
  });

  it('Chamadas/Operação continuam CPC = cpc/tabuladas, independentes do overlay', () => {
    expect(cpcOperacional(13, 20)).toBe(65);
    expect(
      kpisVolumeChamadas({
        ranking: [{ total: 20, cpc: 13, sucesso: 2, recusa: 1 }],
        tabsHumanas: [{ total: 99, cpc: 1 }],
      }).pctCpc,
    ).toBe(65);
    const payload = {
      kpis_chamadas: { cpc: 13, tabuladas: 20 },
      discagens: {
        kpis: {
          dialed: 100,
          contact: 20,
          tabuladas: 20,
          cpc: 1,
          sucesso: 2,
          contact_rate: 20,
          cpc_rate: 5,
          efficacy: 2,
        },
        serie_hora: [{ hora: '10', dialed: 100, contact: 20, tabuladas: 20, cpc: 1, sucesso: 2 }],
        por_supervisor: [
          {
            supervisor_name: 'A',
            operadores: 1,
            tabuladas: 20,
            cpc: 13,
            sucesso: 2,
            cpc_rate: 65,
            conv_tab: 10,
          },
        ],
      },
    } as unknown as EvaPayload;
    const disc = applyCpcTabulacaoHumana(resolveDiscagens(payload));
    expect(disc.kpis.cpc).toBe(13);
    expect(payload.kpis_chamadas.cpc).toBe(13);
    expect(payload.kpis_chamadas.tabuladas).toBe(20);
  });
});
