// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RrExecutiveDecision } from './RrExecutiveDecision';

describe('RrExecutiveDecision', () => {
  it('expõe situação, driver, decisão, dono e prazo', () => {
    render(
      <MemoryRouter>
        <RrExecutiveDecision
          pctMeta={72}
          gap={-18}
          driver={{ label: 'Supervisão A', valor: -12, pct: 66.7 }}
          opportunity={{ titulo: 'Recuperar até a mediana', detalhe: 'gap', href: '/hora' }}
          action={{ titulo: 'Coaching imediato', owner: 'Gestor A', prazo: '2026-09-08', atrasada: true }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Abaixo da referência')).toBeTruthy();
    expect(screen.getByText('Supervisão A')).toBeTruthy();
    expect(screen.getByText('Recuperar até a mediana')).toBeTruthy();
    expect(screen.getByText('Gestor A')).toBeTruthy();
    expect(screen.getByText(/atrasada/)).toBeTruthy();
  });
});
