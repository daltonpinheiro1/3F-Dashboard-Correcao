import { Clock, Gauge, PhoneCall, Radio } from 'lucide-react';
import { fmtHms } from '../../lib/evaDash';
import type { DropAgg } from '../../lib/evaDash';
import type { PulseHoraChamadas } from '../../lib/chamadasVisoes';
import { DROP_ALERTA_PCT } from '../../lib/chamadasVisoes';

export function HoraPulse({
  pctCpc,
  drop,
  tma,
  attN,
  horas,
  horaFiltro,
}: {
  pctCpc: number;
  drop: DropAgg;
  tma: number;
  attN: number;
  horas: PulseHoraChamadas[];
  horaFiltro: string;
}) {
  const dropWarn = drop.tabs > 0 && drop.rate >= DROP_ALERTA_PCT;
  const horaCrise = horas.filter((h) => h.crise);
  const maxDrop = Math.max(1, ...horas.map((h) => h.dropRate));

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-900 text-white p-4">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pulse hora a hora</p>
      <p className="text-xs text-slate-400 mt-0.5">
        CPC do {horaFiltro === 'todas' ? 'dia' : `intervalo ${horaFiltro}h`} · DROP do dia · TMA ponderado
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Gauge size={11} /> CPC
          </p>
          <p className="text-lg font-black tabular-nums">{pctCpc.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <PhoneCall size={11} /> DROP dia
          </p>
          <p className={`text-lg font-black tabular-nums ${dropWarn ? 'text-red-300' : ''}`}>
            {drop.tabs ? `${drop.rate.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock size={11} /> TMA
          </p>
          <p className="text-lg font-black tabular-nums">{attN ? fmtHms(tma) : '—'}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end gap-0.5 h-10">
        {horas.map((h) => (
          <div key={h.hora} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className={`w-full rounded-sm ${h.crise ? 'bg-red-400' : 'bg-white/20'}`}
              style={{ height: `${Math.max(8, (h.dropRate / maxDrop) * 100)}%` }}
              title={`${h.hora}h DROP ${h.dropRate.toFixed(1)}%`}
            />
          </div>
        ))}
      </div>
      {horaCrise.length > 0 && (
        <p className="text-[10px] text-red-300 mt-2 flex items-center gap-1">
          <Radio size={11} />
          {horaCrise.length} hora(s) em crise (DROP ≥ {DROP_ALERTA_PCT}%)
        </p>
      )}
    </section>
  );
}
