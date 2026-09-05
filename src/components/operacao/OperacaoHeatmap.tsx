import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { HeatmapOperacao } from '../../lib/operacaoVisoes';

export function OperacaoHeatmap({ mapa, tab }: { mapa: HeatmapOperacao; tab: 'live' | 'hist' }) {
  if (!mapa.supervisores.length) {
    return (
      <div className="card p-4 mb-6 text-sm text-gray-500">
        Sem hora × supervisor neste dia ({mapa.dia || '—'}).
      </div>
    );
  }

  const cellOf = (sup: string, hh: string) =>
    mapa.celulas.find((c) => c.supervisor === sup && c.hora === hh);

  return (
    <section className="card shadow-sm mb-6 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-900">Mapa hora × supervisor</h2>
          <p className="text-xs text-gray-400">
            Dia {mapa.dia}
            {tab === 'hist' ? ' (último dia do recorte — Hora também não soma dias)' : ' ao vivo'}
            {' · '}CPC da célula = cpc/tabs da hora · DROP da coluna = Agente Desligou na hora (produto)
            {' · '}crise = atraso na hora + DROP hora ≥ 25%
          </p>
        </div>
        <Link to="/hora" className="text-[11px] font-semibold text-indigo-700 inline-flex items-center gap-1">
          Abrir Hora <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-50">Supervisor</th>
              {mapa.horas.map((h) => (
                <th
                  key={h}
                  className={`px-1 py-2 text-center font-semibold ${mapa.horaAtual === h ? 'text-indigo-700' : ''}`}
                >
                  {h}h
                  <div
                    className={`text-[10px] font-normal ${(mapa.dropHora[h]?.rate || 0) >= 25 ? 'text-red-600' : 'text-gray-400'}`}
                  >
                    D {mapa.dropHora[h]?.tabs ? `${mapa.dropHora[h].rate.toFixed(0)}%` : '—'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapa.supervisores.map((sup) => (
              <tr key={sup} className="border-t border-gray-50">
                <td className="px-3 py-1.5 font-medium text-gray-800 sticky left-0 bg-white max-w-[140px] truncate">
                  {sup}
                </td>
                {mapa.horas.map((h) => {
                  const c = cellOf(sup, h);
                  if (!c || (!c.tabs && !c.atrasos)) {
                    return <td key={h} className="px-1 py-1 text-center text-gray-300">·</td>;
                  }
                  const bg = c.crise
                    ? 'bg-red-600 text-white'
                    : c.abaixoMeta
                      ? 'bg-amber-100 text-amber-950'
                      : c.atrasos
                        ? 'bg-orange-50 text-orange-900'
                        : 'bg-emerald-50 text-emerald-900';
                  return (
                    <td key={h} className="px-1 py-1 text-center">
                      <div className={`rounded px-0.5 py-0.5 tabular-nums ${bg}`} title={tituloCelula(c)}>
                        {c.tabs ? `${c.pct.toFixed(0)}%` : '—'}
                        {c.atrasos > 0 && <span className="block text-[9px]">+{c.atrasos} atr.</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function tituloCelula(c: { tabs: number; cpc: number; pct: number; atrasos: number; dropHoraRate: number; crise: boolean }) {
  return `${c.cpc}/${c.tabs} CPC ${c.pct.toFixed(1)}% · DROP hora ${c.dropHoraRate.toFixed(1)}% · atrasos ${c.atrasos}${c.crise ? ' · CRISE' : ''}`;
}
