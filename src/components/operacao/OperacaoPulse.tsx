import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Brain,
  Clock,
  Headphones,
  Radio,
  Target,
  TrendingDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { FocoId } from '../../lib/ofensorOp';

export type PisoMix = {
  instavel: number;
  pausa: number;
  disponivel: number;
  atendimento: number;
  total: number;
};

export type PulseOfensor = {
  login: string;
  nome: string;
  supervisor: string;
  nivel: 'critico' | 'alto' | 'medio' | 'ok';
  titulo: string;
};

export type PulseSupRisco = {
  supervisor: string;
  ofensores: number;
  dropRate: number;
  cpcPct: number;
  meta: number;
  gap: number;
};

export type PulseWhatIf = {
  ka: number;
  ocupacaoPct: number;
  tabs1h: number;
};

const FOCO_LABEL: Record<FocoId, string> = {
  atraso: 'Atraso',
  deslogue: 'Deslog',
  pausa: 'Pausa+',
  cpc: 'CPC',
  logado: 'Jornada',
};

export function OperacaoPulse({
  tab,
  staleMin,
  cpcPct,
  cpcMeta,
  tabuladas,
  dropRate,
  dropTabs,
  piso,
  focoCounts,
  intervencao,
  supersRisco,
  whatIf,
  muted,
  onToggleMute,
  onOpenFicha,
  onVista,
  onFoco,
}: {
  tab: 'live' | 'hist';
  staleMin?: number;
  cpcPct: number;
  cpcMeta: number;
  tabuladas: number;
  dropRate: number;
  dropTabs: number;
  piso: PisoMix;
  focoCounts: Record<FocoId, number>;
  intervencao: PulseOfensor[];
  supersRisco: PulseSupRisco[];
  whatIf?: PulseWhatIf;
  muted?: boolean;
  onToggleMute?: () => void;
  onOpenFicha: (login: string) => void;
  onVista: (v: 'piso' | 'ofensores') => void;
  onFoco: (f: 'todos' | FocoId) => void;
}) {
  const staleWarn = staleMin != null && staleMin >= 8;
  const cpcWarn = tabuladas >= 8 && cpcPct < cpcMeta;
  const dropWarn = dropTabs > 0 && dropRate >= 25;
  const maxFoco = Math.max(1, ...Object.values(focoCounts));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pulse operacional</p>
          <h2 className="text-lg font-black leading-tight">O que exige intervenção agora</h2>
          <p className="text-xs text-slate-400 mt-1">
            CPC e DROP canônicos (Agente Desligou) · piso ao vivo · fila de ofensores
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
              title={muted ? 'Ativar alerta sonoro' : 'Silenciar alerta (KA≥3 ou EVA ≥8 min)'}
            >
              {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
              {muted ? 'Mudo' : 'Som'}
            </button>
          )}
          <Link
            to="/hora"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <Clock size={12} /> Hora <ArrowUpRight size={11} />
          </Link>
          <Link
            to="/discagens"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <Headphones size={12} /> Discagens <ArrowUpRight size={11} />
          </Link>
          <Link
            to="/inteligencia"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <Brain size={12} /> Inteligência <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <PulseStat
          icon={Radio}
          label={tab === 'live' ? 'EVA ao vivo' : 'Recorte hist.'}
          value={
            tab === 'live'
              ? staleMin == null
                ? 'sem sync'
                : staleMin <= 1
                  ? 'agora'
                  : `${staleMin} min`
              : 'histórico'
          }
          warn={tab === 'live' && staleWarn}
          hint={tab === 'live' && staleWarn ? 'Snapshot atrasado — trate com reserva' : 'Bit EVA de keep-alive'}
        />
        <PulseStat
          icon={Target}
          label="CPC operacional"
          value={tabuladas ? `${cpcPct.toFixed(1)}%` : '—'}
          warn={cpcWarn}
          hint={`meta ${cpcMeta}% · ${tabuladas} tab. humanas`}
          onClick={() => {
            onVista('ofensores');
            onFoco('cpc');
          }}
        />
        <PulseStat
          icon={TrendingDown}
          label="DROP agente"
          value={dropTabs ? `${dropRate.toFixed(1)}%` : '—'}
          warn={dropWarn}
          hint="Culpa do agente (não queda / cliente)"
        />
        <PulseStat
          icon={Activity}
          label={tab === 'live' ? 'Piso agora' : 'Ofensores'}
          value={tab === 'live' ? String(piso.total) : String(intervencao.length)}
          hint={
            tab === 'live'
              ? `${piso.instavel} instável · ${piso.pausa} pausa · ${piso.atendimento} fala`
              : 'pior score no recorte'
          }
          onClick={() => onVista(tab === 'live' ? 'piso' : 'ofensores')}
        />
      </div>

      {whatIf && whatIf.ka > 0 && (
        <div className="mb-4 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200">
          What-if piso: se {whatIf.ka} {tab === 'live' ? 'instável(is)' : 'KA aberto(s)'} voltassem 1h no ritmo
          observado (ocupação {whatIf.ocupacaoPct.toFixed(0)}% · TMA da jornada) →{' '}
          <strong className="text-white">+{whatIf.tabs1h} tabs</strong>
          {' · '}mesmo modelo da aba Hora (logado/TMA).
        </div>
      )}

      {tab === 'live' && piso.total > 0 && (
        <div className="mb-4">
          <p className="text-[11px] text-slate-400 font-semibold mb-1.5">Mix do piso</p>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-white/10">
            {piso.instavel > 0 && (
              <div className="bg-red-500" style={{ width: `${(100 * piso.instavel) / piso.total}%` }} title="Instável" />
            )}
            {piso.pausa > 0 && (
              <div className="bg-amber-400" style={{ width: `${(100 * piso.pausa) / piso.total}%` }} title="Pausa" />
            )}
            {piso.atendimento > 0 && (
              <div className="bg-sky-400" style={{ width: `${(100 * piso.atendimento) / piso.total}%` }} title="Atendimento" />
            )}
            {piso.disponivel > 0 && (
              <div className="bg-emerald-400" style={{ width: `${(100 * piso.disponivel) / piso.total}%` }} title="Disponível" />
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-slate-400">
            <span className="text-red-300">{piso.instavel} KA atrasado</span>
            <span className="text-amber-200">{piso.pausa} pausa</span>
            <span className="text-sky-200">{piso.atendimento} atendimento</span>
            <span className="text-emerald-200">{piso.disponivel} disponível</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] text-slate-400 font-semibold mb-2">Focos no recorte</p>
          <ul className="space-y-1.5">
            {(['atraso', 'deslogue', 'pausa', 'cpc', 'logado'] as FocoId[]).map((id) => {
              const n = focoCounts[id] || 0;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      onVista('ofensores');
                      onFoco(id);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <span>{FOCO_LABEL[id]}</span>
                      <span className="tabular-nums">{n}</span>
                    </div>
                    <div className="h-1.5 rounded bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-indigo-400"
                        style={{ width: `${Math.round((100 * n) / maxFoco)}%` }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="text-[11px] text-slate-400 font-semibold mb-2">Fila de intervenção</p>
          {intervencao.length === 0 ? (
            <p className="text-xs text-emerald-300">Nenhum ofensor crítico no recorte.</p>
          ) : (
            <ul className="space-y-2">
              {intervencao.map((o) => (
                <li key={o.login}>
                  <button
                    type="button"
                    onClick={() => onOpenFicha(o.login)}
                    className="w-full text-left rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{o.nome}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          o.nivel === 'critico'
                            ? 'bg-red-500 text-white'
                            : o.nivel === 'alto'
                              ? 'bg-orange-400 text-slate-950'
                              : 'bg-amber-200 text-amber-950'
                        }`}
                      >
                        {o.nivel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {o.supervisor} · {o.titulo}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-[11px] text-slate-400 font-semibold mb-2">Risco por supervisor</p>
          {supersRisco.length === 0 ? (
            <p className="text-xs text-slate-400">Sem concentração de ofensores.</p>
          ) : (
            <ul className="space-y-2">
              {supersRisco.map((s) => (
                <li key={s.supervisor} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-200">{s.supervisor}</span>
                  <span className={`tabular-nums shrink-0 ${s.gap < 0 ? 'text-red-300' : 'text-slate-400'}`}>
                    {s.ofensores} of. · {s.gap >= 0 ? '+' : ''}
                    {s.gap.toFixed(1)} pp vs {s.meta}% · D {s.dropRate.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function PulseStat({
  icon: Icon,
  label,
  value,
  hint,
  warn,
  onClick,
}: {
  icon: typeof Radio;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
        <Icon size={14} className={warn ? 'text-red-300' : 'text-indigo-300'} />
      </div>
      <p className={`text-2xl font-black ${warn ? 'text-red-300' : 'text-white'}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-xl bg-white/5 hover:bg-white/10 p-3 text-left">
        {inner}
      </button>
    );
  }
  return <div className="rounded-xl bg-white/5 p-3">{inner}</div>;
}
