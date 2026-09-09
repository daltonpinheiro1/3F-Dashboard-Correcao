import { AlertTriangle, CheckCircle2, Clock3, Target, UserRoundCheck } from 'lucide-react';
import type { NowcastSup } from '../../lib/horaPageData';

export function HoraCommandStrip({
  historico,
  realizado,
  metaAgora,
  gap,
  ritmoNecessario,
  ritmoBase,
  piorSupervisor,
  cpc,
  metaCpc,
}: {
  historico: boolean;
  realizado: number;
  metaAgora: number;
  gap: number;
  ritmoNecessario: number;
  ritmoBase: number;
  piorSupervisor?: NowcastSup;
  cpc: number;
  metaCpc: number;
}) {
  const healthy = gap >= 0;
  const cpcRisk = cpc < metaCpc;
  const action = historico
    ? 'Fechamento consolidado; use os drivers abaixo para a retrospectiva.'
    : piorSupervisor && piorSupervisor.gapSup < 0
      ? `${piorSupervisor.supervisor}: recuperar ${Math.round(piorSupervisor.metaRestante)} un. a ${piorSupervisor.metaPorHoraRestante} un./h.`
      : cpcRisk
        ? `Atuar em tabulação: CPC ${cpc.toFixed(1)}% abaixo da meta ${metaCpc}%.`
        : 'Sustentar ritmo, CPC e qualidade na próxima hora.';

  return (
    <section
      className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label="Agora e próxima hora"
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Agora e próxima hora</p>
        <p className="mt-0.5 text-xs text-slate-500">Leitura de intervalo: situação, pressão e ação imediata.</p>
      </div>
      <div className="grid gap-px bg-slate-200/70 sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-white p-4">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
            {healthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} Situação
          </p>
          <p className={`mt-2 text-lg font-black ${healthy ? 'text-emerald-700' : 'text-rose-700'}`}>
            {historico ? 'Fechado' : healthy ? 'No ritmo' : 'Requer reação'}
          </p>
          <p className="text-xs text-slate-500">gap {gap > 0 ? '+' : ''}{gap} un.</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-bold uppercase text-slate-400">Realizado × esperado</p>
          <p className="mt-2 text-lg font-black tabular-nums text-slate-900">{realizado}</p>
          <p className="text-xs text-slate-500">esperado agora {Math.round(metaAgora * 10) / 10}</p>
        </div>
        <div className="bg-white p-4">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
            <Clock3 size={12} /> Ritmo necessário
          </p>
          <p className="mt-2 text-lg font-black tabular-nums text-slate-900">{ritmoNecessario} un./h</p>
          <p className="text-xs text-slate-500">baseline {ritmoBase} un./h</p>
        </div>
        <div className="bg-white p-4">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
            <Target size={12} /> Pressão principal
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {piorSupervisor?.gapSup && piorSupervisor.gapSup < 0
              ? piorSupervisor.supervisor
              : cpcRisk
                ? 'CPC abaixo da meta'
                : 'Sem desvio crítico'}
          </p>
          <p className="text-xs text-slate-500">
            {piorSupervisor?.gapSup && piorSupervisor.gapSup < 0
              ? `gap ${piorSupervisor.gapSup} un.`
              : `CPC ${cpc.toFixed(1)}%`}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
            <UserRoundCheck size={12} /> Ação recomendada
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{action}</p>
        </div>
      </div>
    </section>
  );
}
