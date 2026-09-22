import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SortTh } from './SortTh';
import { fmtDur } from '../lib/evaDash';
import type { OciosidadeOp, OciosidadeResumo, OciosidadeSup } from '../lib/ociosidade';
import { useTableSortFields } from '../lib/tableSort';

function fmtVales(n: number | null): string {
  if (n == null) return '—';
  return String(Math.round(n));
}

function supervisoresDos(ops: OciosidadeOp[]): OciosidadeSup[] {
  const porSup = new Map<string, OciosidadeSup & { viuVales: boolean }>();
  for (const o of ops) {
    const prev = porSup.get(o.supervisor) || {
      supervisor: o.supervisor,
      operadores: 0,
      espera: 0,
      falando: 0,
      tabulando: 0,
      discando: 0,
      base: 0,
      chamadas: 0,
      intervaloMedio: 0,
      pct: 0,
      vales: 0,
      viuVales: false,
    };
    prev.operadores += 1;
    prev.espera += o.espera;
    prev.falando += o.falando;
    prev.tabulando += o.tabulando;
    prev.discando += o.discando;
    prev.base += o.base;
    prev.chamadas += o.chamadas;
    if (o.vales != null) {
      prev.viuVales = true;
      prev.vales = (prev.vales || 0) + o.vales;
    }
    porSup.set(o.supervisor, prev);
  }
  return [...porSup.values()].map((s) => ({
    supervisor: s.supervisor,
    operadores: s.operadores,
    espera: s.espera,
    falando: s.falando,
    tabulando: s.tabulando,
    discando: s.discando,
    base: s.base,
    chamadas: s.chamadas,
    intervaloMedio: s.chamadas > 0 ? s.espera / s.chamadas : 0,
    pct: s.base > 0 ? (100 * s.espera) / s.base : 0,
    vales: s.viuVales ? s.vales || 0 : null,
  }));
}

export function OciosidadePainel({ resumo }: { resumo: OciosidadeResumo }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const lista = resumo.porOperador.length ? resumo.porOperador : resumo.ofensores;
  const operadores = useMemo(() => {
    if (!needle) return lista;
    return lista.filter((o) => `${o.nome} ${o.supervisor}`.toLowerCase().includes(needle));
  }, [lista, needle]);
  const supervisores = useMemo(
    () => (needle ? supervisoresDos(operadores) : resumo.porSupervisor),
    [needle, operadores, resumo.porSupervisor],
  );
  const opSort = useTableSortFields(operadores, 'vales', 'desc');
  const supSort = useTableSortFields(supervisores, 'espera', 'desc');

  if (!resumo.medido) {
    return (
      <div className="card p-5 shadow-sm mb-6">
        <h2 className="text-sm font-bold text-gray-800">Ociosidade entre ligações</h2>
        <p className="text-xs text-gray-400 mt-1">
          A jornada deste recorte ainda não trouxe o tempo disponível do EVA.
        </p>
      </div>
    );
  }

  return (
    <div className="card shadow-sm mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Ociosidade entre ligações</h2>
          <p className="text-xs text-gray-400 mt-1 max-w-3xl">
            Tempo disponível entre ligações, somando cada jornada. Pausa e relogin saem da base
            {resumo.pausa > 0 || resumo.relogin > 0
              ? ` (fora: ${fmtDur(resumo.pausa)} pausa · ${fmtDur(resumo.relogin)} relogin)`
              : ''}.
            {' '}A média é a espera dividida pelos atendimentos, ponderada pelo volume.
            A conferência do percentual é espera + falado + pós-tabulação + discagem sobre o tempo útil.
            Um vale é um vão entre duas ligações com mais de 45s parado, já sem pausa e sem relogin.
          </p>
        </div>
        <label className="relative block">
          <span className="sr-only">Filtrar operador</span>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar operador"
            className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        <Tile label="Espera" value={fmtDur(resumo.espera)} hint={`${resumo.pct.toFixed(1)}% do tempo útil`} />
        <Tile label="Espera média" value={fmtDur(resumo.intervaloMedio)} hint="por atendimento · time" />
        <Tile label="Em ligação" value={fmtDur(resumo.falando)} hint={`pós-tab ${fmtDur(resumo.tabulando)}`} />
        <Tile
          label="Vales > 45s"
          value={fmtVales(resumo.vales)}
          hint={resumo.vales == null ? 'entra no próximo sync EVA' : 'janelas entre ligações'}
          warn={resumo.vales != null && resumo.vales > 0}
        />
      </div>
      {supervisores.length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <p className="px-4 pt-3 text-[11px] font-semibold text-gray-500">Por supervisor · média ponderada pelos atendimentos</p>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <SortTh label="Supervisor" col="supervisor" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="left" className="px-4" />
                <SortTh label="Ops" col="operadores" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
                <SortTh label="Espera" col="espera" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
                <SortTh label="Falado" col="falando" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
                <SortTh label="Média" col="intervaloMedio" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
                <SortTh label="% útil" col="pct" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
                <SortTh label="Vales > 45s" col="vales" sortKey={supSort.sortKey} sortDir={supSort.sortDir} onSort={supSort.toggleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {supSort.sorted.map((s) => (
                <tr key={s.supervisor} className="border-t border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{s.supervisor}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.operadores}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtDur(s.espera)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={`pós-tab ${fmtDur(s.tabulando)} · discando ${fmtDur(s.discando)}`}>{fmtDur(s.falando)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtDur(s.intervaloMedio)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${s.pct >= 25 ? 'text-rose-700' : 'text-gray-700'}`}>
                    {s.pct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-rose-700">{fmtVales(s.vales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-gray-100">
        <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-500">
          Operadores com espera no tempo útil
          {needle ? ` · ${operadores.length} no filtro` : ` · ${operadores.length}`}
        </p>
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
            <tr>
              <SortTh label="Operador" col="nome" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="left" className="px-4" />
              <SortTh label="Espera" col="espera" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="right" />
              <SortTh label="Falado" col="falando" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="right" />
              <SortTh label="Média" col="intervaloMedio" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="right" />
              <SortTh label="% útil" col="pct" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="right" />
              <SortTh label="Vales > 45s" col="vales" sortKey={opSort.sortKey} sortDir={opSort.sortDir} onSort={opSort.toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {opSort.sorted.map((o) => (
              <tr key={`${o.nome}-${o.supervisor}`} className="border-t border-gray-50">
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-800">{o.nome}</p>
                  <p className="text-[11px] text-gray-400">{o.supervisor}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtDur(o.espera)}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={`pós-tab ${fmtDur(o.tabulando)} · discando ${fmtDur(o.discando)} · útil ${fmtDur(o.base)}`}>{fmtDur(o.falando)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtDur(o.intervaloMedio)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${o.pct >= 25 ? 'text-rose-700' : 'text-gray-700'}`}>
                  {o.pct.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right font-semibold text-rose-700">{fmtVales(o.vales)}</td>
              </tr>
            ))}
            {operadores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum operador com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-lg font-black tabular-nums ${warn ? 'text-rose-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-400">{hint}</p>
    </div>
  );
}
