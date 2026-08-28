import type { Atestado } from './atestadosEscala';

export type PadraoAbsenteismo = {
  id: string;
  severidade: 'info' | 'atencao' | 'alerta';
  titulo: string;
  detalhe: string;
  colaborador: string;
  matricula?: string | null;
  atestados: Atestado[];
};

const JANELA_DIAS = 60;
const LIMIAR_QTD = 3;
const LIMIAR_DIAS = 12;

function chaveColab(r: Atestado): string {
  return `${r.colaborador_matricula || ''}|${r.colaborador_nome.toLowerCase().trim()}`;
}

function parseIso(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
}

export function detectarPadroesAbsenteismo(rows: Atestado[], ref = new Date()): PadraoAbsenteismo[] {
  const refMs = ref.getTime();
  const janelaMs = JANELA_DIAS * 86_400_000;
  const ativos = rows.filter(
    (r) => !['recusado', 'cancelada'].includes(String(r.status)) && r.data_inicio,
  );
  const recentes = ativos.filter((r) => {
    const t = parseIso(r.data_inicio!);
    return refMs - t <= janelaMs;
  });

  const porColab = new Map<string, Atestado[]>();
  for (const r of recentes) {
    const k = chaveColab(r);
    porColab.set(k, [...(porColab.get(k) || []), r]);
  }

  const padroes: PadraoAbsenteismo[] = [];

  for (const [, lista] of porColab) {
    if (lista.length < LIMIAR_QTD) continue;
    const first = lista[0];
    padroes.push({
      id: `freq-${chaveColab(first)}`,
      severidade: lista.length >= 5 ? 'alerta' : 'atencao',
      titulo: `${lista.length} atestados em ${JANELA_DIAS} dias`,
      detalhe: 'Frequência elevada — avaliar padrão com gestão.',
      colaborador: first.colaborador_nome,
      matricula: first.colaborador_matricula,
      atestados: lista,
    });
  }

  const porCid = new Map<string, Atestado[]>();
  for (const r of recentes) {
    const cid = String(r.cid || '').trim().toUpperCase();
    if (!cid) continue;
    porCid.set(cid, [...(porCid.get(cid) || []), r]);
  }
  for (const [cid, lista] of porCid) {
    if (lista.length < 4) continue;
    padroes.push({
      id: `cid-${cid}`,
      severidade: 'info',
      titulo: `CID ${cid} recorrente (${lista.length}×)`,
      detalhe: `Mesmo CID em ${lista.length} atestados na janela de ${JANELA_DIAS} dias.`,
      colaborador: `${lista.length} colaboradores`,
      matricula: null,
      atestados: lista,
    });
  }

  for (const [, lista] of porColab) {
    const diasTotal = lista.reduce((s, r) => s + (Number(r.quantidade_dias) || 0), 0);
    if (diasTotal < LIMIAR_DIAS || lista.length < 2) continue;
    const first = lista[0];
    padroes.push({
      id: `dias-${chaveColab(first)}`,
      severidade: diasTotal >= 20 ? 'alerta' : 'atencao',
      titulo: `${diasTotal} dias afastados em ${JANELA_DIAS} dias`,
      detalhe: 'Volume acumulado de afastamento na janela.',
      colaborador: first.colaborador_nome,
      matricula: first.colaborador_matricula,
      atestados: lista,
    });
  }

  const ordem = { alerta: 0, atencao: 1, info: 2 };
  return padroes.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}
