import { Link } from 'react-router-dom';
import { Gauge, PhoneCall, Radio, Target } from 'lucide-react';
import { DROP_ALERTA_PCT } from '../../lib/chamadasVisoes';

export function DiscagensPulse({
  locPct,
  cpcPct,
  dropPct,
  dropDisponivel,
  temDialer,
  locDisponivel = true,
  audit,
}: {
  locPct: number;
  cpcPct: number;
  dropPct: number;
  dropDisponivel: boolean;
  temDialer: boolean;
  locDisponivel?: boolean;
  audit: { jornadaTabs: number; delta: number; bate: boolean; comparavel: boolean };
}) {
  const dropWarn = dropDisponivel && dropPct >= DROP_ALERTA_PCT;

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-900 text-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pulse do funil dialer</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Loc% dialer · CPC% tabulação EVA · DROP agente — CPC alinhado a Chamadas/Operação
          </p>
        </div>
        <Link to="/chamadas" className="text-[11px] text-teal-300 hover:underline">
          Ver CPC casa
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Target size={11} /> Loc%
          </p>
          <p className="text-lg font-black tabular-nums">{temDialer && locDisponivel ? `${locPct}%` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Gauge size={11} /> CPC tabulação
          </p>
          <p className="text-lg font-black tabular-nums">{cpcPct}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <PhoneCall size={11} /> DROP agente
          </p>
          <p className={`text-lg font-black tabular-nums ${dropWarn ? 'text-red-300' : ''}`}>
            {dropDisponivel ? `${dropPct}%` : '—'}
          </p>
        </div>
      </div>
      {audit.comparavel && (
        <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
          <Radio size={11} />
          Dialer {audit.jornadaTabs + audit.delta} tabs · jornada {audit.jornadaTabs}
          {audit.bate ? ' · bate' : ` · Δ ${audit.delta > 0 ? '+' : ''}${audit.delta}`}
        </p>
      )}
    </section>
  );
}
