import { Link } from 'react-router-dom';
import { Clock, Gauge, PhoneCall, Radio, Target } from 'lucide-react';
import { DROP_ALERTA_PCT } from '../../lib/chamadasVisoes';
import { fmtDur } from '../../lib/evaDash';

export function DiscagensPulse({
  locPct,
  cpcPct,
  dropPct,
  dropDisponivel,
  temDialer,
  locDisponivel = true,
  audit,
  evaDb,
  discagensAt,
  monitorFaltando,
  ociosidadeMedia,
  ociosidadeMedida,
  vales,
}: {
  locPct: number;
  cpcPct: number;
  dropPct: number;
  dropDisponivel: boolean;
  temDialer: boolean;
  locDisponivel?: boolean;
  audit: { jornadaTabs: number; delta: number; bate: boolean; comparavel: boolean };
  evaDb?: string;
  discagensAt?: string;
  monitorFaltando?: string;
  ociosidadeMedia: number;
  ociosidadeMedida: boolean;
  vales: number | null;
}) {
  const dropWarn = dropDisponivel && dropPct >= DROP_ALERTA_PCT;
  const evaDown = (evaDb || '').toLowerCase() === 'down';
  const horaFunil = (discagensAt || '').slice(11, 16);
  const funilParcial = Boolean(monitorFaltando);

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-slate-900 text-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pulse do funil dialer</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Loc% = agente÷tentativas (esforço incl. robô) · CPC% tabulação humana · DROP agente
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evaDown ? (
              <span className="text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-200 px-2 py-0.5">
                EVA instável — heartbeat
              </span>
            ) : (
              <span className="text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-200 px-2 py-0.5">
                EVA ok
              </span>
            )}
            {horaFunil ? (
              <span className="text-[10px] font-semibold rounded-full bg-slate-700 text-slate-200 px-2 py-0.5">
                Funil {horaFunil}
              </span>
            ) : null}
            {funilParcial ? (
              <span className="text-[10px] font-semibold rounded-full bg-sky-500/20 text-sky-200 px-2 py-0.5">
                Cubo parcial {monitorFaltando}
              </span>
            ) : (
              <span className="text-[10px] font-semibold rounded-full bg-slate-700 text-slate-300 px-2 py-0.5">
                Monitor completo
              </span>
            )}
          </div>
        </div>
        <Link to="/chamadas" className="text-[11px] text-teal-300 hover:underline">
          Ver CPC casa
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
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
        <div>
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock size={11} /> Ociosidade média
          </p>
          <p className={`text-lg font-black tabular-nums ${ociosidadeMedida && ociosidadeMedia >= 45 ? 'text-amber-200' : ''}`}>
            {ociosidadeMedida ? fmtDur(ociosidadeMedia) : '—'}
          </p>
          <p className="text-[10px] text-slate-500">
            {vales == null ? 'vales > 45s no próximo sync' : `${Math.round(vales)} vales > 45s`}
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
