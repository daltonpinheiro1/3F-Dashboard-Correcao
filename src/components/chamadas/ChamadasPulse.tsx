import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Clock,
  Headphones,
  PhoneCall,
  Radio,
  Target,
  TrendingDown,
} from 'lucide-react';
import { fmtHms } from '../../lib/evaDash';
import type { DropAgg } from '../../lib/evaDash';
import type { OfensorTabVisao, PulseHoraChamadas } from '../../lib/chamadasVisoes';
import { DROP_ALERTA_PCT } from '../../lib/chamadasVisoes';

export function ChamadasPulse({
  tab,
  pctCpc,
  metaCpc,
  tabuladas,
  cpcN,
  drop,
  tma,
  attN,
  conversao,
  ofensor,
  horas,
  audit,
  onOfensor,
}: {
  tab: 'live' | 'hist';
  pctCpc: number;
  metaCpc: number;
  tabuladas: number;
  cpcN: number;
  drop: DropAgg;
  tma: number;
  attN: number;
  conversao: number;
  ofensor: OfensorTabVisao | null;
  horas: PulseHoraChamadas[];
  audit: { jornadaTabs: number; delta: number; bate: boolean; comparavel: boolean };
  onOfensor: (nome: string, campanha_op?: string) => void;
}) {
  const cpcWarn = tabuladas >= 8 && pctCpc < metaCpc;
  const dropWarn = drop.tabs > 0 && drop.rate >= DROP_ALERTA_PCT;
  const horaCrise = horas.filter((h) => h.crise);
  const maxDrop = Math.max(1, ...horas.map((h) => h.dropRate));

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 text-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pulse das chamadas</p>
          <h2 className="text-lg font-black leading-tight">Um número · o mesmo das outras abas</h2>
          <p className="text-xs text-slate-400 mt-1">
            CPC = CPC÷tabuladas · DROP = bit Agente Desligou · TMA ponderado pela jornada
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/operacao"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <Radio size={12} /> Operação <ArrowUpRight size={11} />
          </Link>
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
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <PulseStat
          icon={Target}
          label="CPC operacional"
          value={tabuladas ? `${pctCpc.toFixed(1)}%` : '—'}
          warn={cpcWarn}
          hint={`${cpcN} / ${tabuladas} · meta ${metaCpc}%`}
        />
        <PulseStat
          icon={TrendingDown}
          label="DROP agente"
          value={drop.tabs ? `${drop.rate.toFixed(1)}%` : '—'}
          warn={dropWarn}
          hint={`${drop.drop} / ${drop.tabs} · culpa do agente (não queda)`}
        />
        <PulseStat
          icon={Clock}
          label="TMA ponderado"
          value={fmtHms(tma)}
          hint={`${attN} atend. · Σ(TMA×ch) / Σ(ch)`}
        />
        <PulseStat
          icon={PhoneCall}
          label="Conversão"
          value={tabuladas ? `${conversao.toFixed(1)}%` : '—'}
          hint={`${tab === 'live' ? 'hoje' : 'recorte'} · sucesso / tabuladas`}
        />
      </div>

      <div className="mb-4 rounded-xl bg-white/5 px-3 py-2 text-[11px] text-slate-300">
        {audit.comparavel && audit.bate ? (
          <span>
            Selo de consistência: tabuladas desta aba = jornada da Operação ({audit.jornadaTabs}).
          </span>
        ) : audit.comparavel && !audit.bate ? (
          <span>
            Tabuladas desta aba seguem o ranking já apresentado ({tabuladas}). Jornada da Operação:{' '}
            {audit.jornadaTabs} (delta {audit.delta > 0 ? '+' : ''}
            {audit.delta}). CPC% e TMA desta tela não foram recalculados.
          </span>
        ) : (
          <span>Busca ativa: o recorte filtra operadores — o número da casa volta ao limpar o filtro.</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <p className="text-[11px] text-slate-400 font-semibold mb-2">
            Faixa horária · CPC da série + DROP canônico
            {tab === 'hist' ? ' · último dia do recorte (igual Hora/Operação)' : ''}
            {horaCrise.length ? ` · ${horaCrise.length} hora(s) com DROP ≥ ${DROP_ALERTA_PCT}%` : ''}
          </p>
          <div className="flex gap-1">
            {horas.map((h) => (
              <div key={h.hora} className="flex-1 min-w-0 text-center" title={`${h.hora}h · CPC ${h.pct}% · DROP ${h.dropRate}% · ${h.tabs} tab.`}>
                <div className="h-12 flex flex-col justify-end gap-0.5">
                  <div
                    className={`rounded-sm ${h.crise ? 'bg-red-400' : 'bg-white/20'}`}
                    style={{
                      height: `${h.dropRate > 0 ? Math.max(4, Math.round((28 * h.dropRate) / maxDrop)) : 0}px`,
                    }}
                  />
                  <div
                    className="rounded-sm bg-teal-400/80"
                    style={{ height: `${h.pct > 0 ? Math.max(3, Math.round((h.pct / 100) * 20)) : 0}px` }}
                  />
                </div>
                <p className={`text-[9px] mt-1 tabular-nums ${h.crise ? 'text-red-300 font-bold' : 'text-slate-500'}`}>
                  {h.hora}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-slate-500">
            <span className="text-teal-300">■ CPC%</span>
            <span className="text-red-300">■ DROP agente%</span>
          </div>
        </div>

        <div>
          <p className="text-[11px] text-slate-400 font-semibold mb-2">Ofensor 1 · tabulação</p>
          {!ofensor ? (
            <p className="text-xs text-emerald-300">Sem tabulação humana no recorte.</p>
          ) : (
            <button
              type="button"
              onClick={() => onOfensor(ofensor.nome, ofensor.campanha_op)}
              className={`w-full text-left rounded-xl px-3 py-2.5 ${
                ofensor.abaixoMeta ? 'bg-red-500/20 border border-red-400/40' : 'bg-white/5 border border-white/10'
              }`}
            >
              <p className="text-sm font-bold leading-snug">{ofensor.nome}</p>
              <p className="text-[11px] text-slate-300 mt-1">
                CPC {ofensor.pct.toFixed(1)}% · {ofensor.total} tab. · TMA {fmtHms(ofensor.tma_seg)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Clique para furar supervisor → operador</p>
            </button>
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
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${warn ? 'bg-red-500/20 border border-red-400/40' : 'bg-white/5'}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
        <Icon size={12} /> {label}
      </div>
      <p className={`text-2xl font-black tabular-nums mt-0.5 ${warn ? 'text-red-200' : 'text-white'}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  );
}
