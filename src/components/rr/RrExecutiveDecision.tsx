import { AlertTriangle, ArrowRight, CheckCircle2, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';

type Driver = { label: string; valor: number; pct: number };
type Opportunity = { titulo: string; detalhe: string; href: string };
type Action = { titulo: string; owner: string; prazo: string; atrasada: boolean };

export function RrExecutiveDecision({
  pctMeta,
  gap,
  driver,
  opportunity,
  action,
  stale,
}: {
  pctMeta: number;
  gap: number;
  driver?: Driver;
  opportunity?: Opportunity;
  action?: Action;
  stale?: boolean;
}) {
  const healthy = gap >= 0;
  const status = stale ? 'Dados aguardando atualização' : healthy ? 'Acima da referência' : 'Abaixo da referência';
  const StatusIcon = stale ? Clock3 : healthy ? CheckCircle2 : AlertTriangle;

  return (
    <section
      className={`mb-6 overflow-hidden rounded-xl border shadow-sm ${
        stale
          ? 'border-amber-200 bg-amber-50/50'
          : healthy
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-rose-200 bg-rose-50/40'
      }`}
      aria-label="Leitura executiva da RR"
    >
      <div className="grid gap-px bg-slate-200/70 lg:grid-cols-4">
        <div className="bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Situação</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-900">
            <StatusIcon size={17} className={healthy ? 'text-emerald-600' : 'text-rose-600'} />
            {status}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {pctMeta}% da meta · gap {gap > 0 ? '+' : ''}{Math.round(gap)}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Maior pressão</p>
          <p className="mt-2 text-sm font-bold text-slate-900">{driver?.label || 'Sem driver negativo medido'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {driver ? `${Math.round(driver.valor)} no gap · ${driver.pct}% da pressão` : 'Nenhuma decomposição negativa no recorte'}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próxima decisão</p>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {opportunity?.titulo || (healthy ? 'Sustentar ritmo e qualidade' : 'Definir ação para o maior gap')}
          </p>
          {opportunity ? (
            <Link
              to={opportunity.href}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
            >
              Abrir diagnóstico <ArrowRight size={12} />
            </Link>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Sem oportunidade automática pendente.</p>
          )}
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responsável e prazo</p>
          <p className={`mt-2 text-sm font-bold ${action?.atrasada ? 'text-rose-700' : 'text-slate-900'}`}>
            {action?.owner || 'Dono ainda não definido'}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
            {action ? `${action.titulo} · ${action.atrasada ? 'atrasada' : `até ${action.prazo}`}` : 'Registre a ação no ciclo da RR.'}
          </p>
        </div>
      </div>
    </section>
  );
}
