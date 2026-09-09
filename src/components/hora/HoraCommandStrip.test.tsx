// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoraCommandStrip } from './HoraCommandStrip';

describe('HoraCommandStrip', () => {
  it('prioriza o supervisor de maior gap e explicita a ação', () => {
    render(
      <HoraCommandStrip
        historico={false}
        realizado={40}
        metaAgora={55}
        gap={-15}
        ritmoNecessario={9}
        ritmoBase={6}
        piorSupervisor={{
          supervisor: 'Supervisão Norte',
          vendidoAteAgora: 10,
          metaDiaSup: 30,
          gapSup: -12,
          metaRestante: 20,
          metaPorHoraRestante: 5,
        }}
        cpc={60}
        metaCpc={65}
      />,
    );
    expect(screen.getByText('Requer reação')).toBeTruthy();
    expect(screen.getByText('Supervisão Norte')).toBeTruthy();
    expect(screen.getByText(/recuperar 20 un\. a 5 un\.\/h/)).toBeTruthy();
  });
});
