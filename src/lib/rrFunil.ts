/**
 * Funil RR ponta a ponta no dia operacional.
 * Janelas diferentes NÃO geram % entre etapas (evita Gross dia vs TIM mês).
 */
export type RrFunilJanela = 'dia' | 'mes' | 'live';

export type RrFunilEtapa = {
  id: string;
  label: string;
  valor: number;
  janela: RrFunilJanela;
  pctDoAnterior: number | null;
  nota?: string;
};

function pct(n: number, d: number) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

export function buildRrFunilDia(opts: {
  dialed: number;
  cpc: number;
  sucessoEva: number;
  aprovadas: number;
  gross: number | null;
  entregues: number | null;
  portadoTim: number | null;
}): RrFunilEtapa[] {
  const { dialed, cpc, sucessoEva, aprovadas, gross, entregues, portadoTim } = opts;
  const etapas: RrFunilEtapa[] = [
    {
      id: 'discagem',
      label: 'Discagem',
      valor: dialed,
      janela: 'dia',
      pctDoAnterior: null,
      nota: dialed ? undefined : 'sem dialed no recorte',
    },
    {
      id: 'cpc',
      label: 'CPC',
      valor: cpc,
      janela: 'dia',
      pctDoAnterior: pct(cpc, dialed || 0),
    },
    {
      id: 'sucesso_eva',
      label: 'Sucesso EVA',
      valor: sucessoEva,
      janela: 'live',
      pctDoAnterior: pct(sucessoEva, cpc || dialed || 0),
    },
    {
      id: 'crivo',
      label: 'Crivo',
      valor: aprovadas,
      janela: 'dia',
      pctDoAnterior: pct(aprovadas, sucessoEva),
    },
  ];

  if (gross != null) {
    etapas.push({
      id: 'gross',
      label: 'Gross',
      valor: gross,
      janela: 'dia',
      pctDoAnterior: null,
      nota: 'OS+ICCID Port · não é % do EVA',
    });
  }
  if (entregues != null) {
    etapas.push({
      id: 'entrega',
      label: 'Entrega',
      valor: entregues,
      janela: 'mes',
      pctDoAnterior: null,
      nota: 'cohort mês',
    });
  }
  if (portadoTim != null) {
    etapas.push({
      id: 'portado',
      label: 'Portado TIM',
      valor: portadoTim,
      janela: 'mes',
      pctDoAnterior: gross != null ? pct(portadoTim, Math.max(gross, 1)) : null,
      nota: 'P+FP mês · % só ilustrativa vs Gross dia',
    });
  }

  return etapas;
}
