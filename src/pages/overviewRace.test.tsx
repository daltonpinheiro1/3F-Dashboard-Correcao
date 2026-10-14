// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuboOverview } from '../../functions/_lib/cuboAggregates';

const fetchCuboOverview = vi.hoisted(() => vi.fn());
vi.mock('../lib/cuboOverview', () => ({ fetchCuboOverview }));
vi.mock('../components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { DashboardPage } from './DashboardPage';
import { SupervisoresPage } from './SupervisoresPage';
import { usePeriodoCompartilhadoStore } from '../store/filtroStore';

afterEach(() => {
  cleanup();
  fetchCuboOverview.mockReset();
  usePeriodoCompartilhadoStore.setState({ periodo: null });
});

function adiado<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function overview(total: number, supervisor: string): CuboOverview {
  const tbx = { tbx_n: 0, tbx_entregue: 0, tbx_em_rota: 0, tbx_insucesso: 0, tbx_sem_rastreio: 0, tbx_pct_entregue: 0, tbx_pct_insucesso: 0 };
  return {
    periodo: { de: '', ate: '' },
    dashboard: {
      total_propostas: total, total_corrigidas: 0, taxa_erro_pct: 0, tempo_medio_ms: 0,
      top_erro: '-', supervisores_ativos: 1, ...tbx,
    },
    dashboard_supervisores: [],
    operadores: [],
    supervisores: [{
      supervisor, equipe: 'E', total_vendedores: 1, total_propostas: total, total_corrigidas: 0,
      taxa_erro_pct: 0, erros_cep: 0, erros_referencia: 0, erros_bairro: 0,
      sms_total: 0, sms_com: 0, sms_adesao: 0, sms_sucesso_com: 0, sms_sucesso_sem: 0,
      sms_pct_suc_com: 0, sms_pct_suc_sem: 0, ...tbx,
    }],
    toutbox_supervisores: [],
  };
}

describe('resposta antiga não sobrescreve o filtro atual', () => {
  it('Dashboard', async () => {
    const antiga = adiado<CuboOverview>();
    const nova = adiado<CuboOverview>();
    fetchCuboOverview.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(nova.promise);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-09-01' } });
    await act(async () => { nova.resolve(overview(222, 'Nova')); });
    await act(async () => { antiga.resolve(overview(111, 'Antiga')); });
    expect(screen.getAllByText('222').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('111')).toHaveLength(0);
  });

  it('Supervisores', async () => {
    const antiga = adiado<CuboOverview>();
    const nova = adiado<CuboOverview>();
    fetchCuboOverview.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(nova.promise);
    render(<MemoryRouter><SupervisoresPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-09-01' } });
    await act(async () => { nova.resolve(overview(222, 'Nova')); });
    await act(async () => { antiga.resolve(overview(111, 'Antiga')); });
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(screen.queryByText('Antiga')).toBeNull();
  });

  it('período escolhido no Dashboard abre em Supervisores', async () => {
    fetchCuboOverview.mockResolvedValue(overview(1, 'S'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-09-30' } });
    cleanup();
    render(<MemoryRouter><SupervisoresPage /></MemoryRouter>);
    expect((screen.getByLabelText('Data inicial') as HTMLInputElement).value).toBe('2026-09-01');
    expect((screen.getByLabelText('Data final') as HTMLInputElement).value).toBe('2026-09-30');
    expect(fetchCuboOverview).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
  });
});
