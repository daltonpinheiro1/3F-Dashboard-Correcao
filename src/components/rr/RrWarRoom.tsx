import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from 'lucide-react';
import type { ForecastDia, MonteCarloDia } from '../../lib/horaPageData';
import { labelGapRitmo } from '../../lib/rrExecutivo';
import type { RrSnapshot } from '../../lib/rrExecutivo';
import type { RrComparativo } from '../../lib/rrComparativos';
import type { RrException } from '../../lib/rrExceptions';
import type { RrFunilEtapa } from '../../lib/rrFunil';
import type { Rr360Bloco } from '../../lib/rr360';
import { RrExceptionBoard } from './RrExceptionBoard';
import { RrFunilStrip } from './RrFunilStrip';

const SLIDES = [
  { id: 'kpis', label: 'KPIs' },
  { id: 'funil', label: 'Funil' },
  { id: 'sups', label: 'Supervisores' },
  { id: 'excecoes', label: 'Ofensores' },
  { id: 'forecast', label: 'Forecast' },
] as const;

const INTERVAL_MS = 20_000;

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

type Props = {
  dataRef: string;
  campanha: string;
  snap: RrSnapshot;
  rr360: Rr360Bloco | null;
  funil: RrFunilEtapa[];
  exceptions: RrException[];
  forecast: ForecastDia | null;
  mc: MonteCarloDia | null;
  cmp: RrComparativo | null;
  briefing: string;
  onExit: () => void;
  kiosk?: boolean;
};

export function RrWarRoom({
  dataRef,
  campanha,
  snap,
  rr360,
  funil,
  exceptions,
  forecast,
  mc,
  cmp,
  briefing,
  onExit,
  kiosk = false,
}: Props) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !kiosk) onExit();
      if (e.key === 'ArrowRight') setSlide((s) => (s + 1) % SLIDES.length);
      if (e.key === 'ArrowLeft') setSlide((s) => (s + SLIDES.length - 1) % SLIDES.length);
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, kiosk]);

  const id = SLIDES[slide]?.id;
  const gap = labelGapRitmo(snap.gap);

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-slate-950 text-white">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-5 sm:px-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">3F · War room RR · 20s</p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {dataRef} · {campanha}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Play' : 'Pausar'}
            </button>
            {!kiosk ? (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                <Minimize2 size={14} /> Sair (Esc)
              </button>
            ) : (
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Modo TV</span>
            )}
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSlide((s) => (s + SLIDES.length - 1) % SLIDES.length)} className="rounded p-1 hover:bg-white/10">
            <ChevronLeft size={18} />
          </button>
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlide(i)}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                i === slide ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => setSlide((s) => (s + 1) % SLIDES.length)} className="rounded p-1 hover:bg-white/10">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-2xl">
          {id === 'kpis' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Vendas EVA', n(snap.vendas)],
                ['% meta', `${snap.pctMetaDia}%`],
                ['Ritmo', gap.texto],
                ['Gross dia', rr360?.aplicavel ? n(rr360.vendasBrutas) : '—'],
                ['Erro', rr360?.aplicavel ? `${rr360.taxaErroPct}%` : '—'],
                ['Logados', n(snap.logados)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{l}</p>
                  <p className="mt-2 text-5xl font-black tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          )}
          {id === 'funil' && <RrFunilStrip etapas={funil} />}
          {id === 'sups' && (
            <ul className="space-y-4">
              {snap.supervisores.slice(0, 8).map((s) => (
                <li key={s.supervisor} className="flex items-center justify-between text-2xl">
                  <span className="font-semibold">{s.supervisor}</span>
                  <span className="tabular-nums font-black text-emerald-700">{s.pctMeta}%</span>
                </li>
              ))}
            </ul>
          )}
          {id === 'excecoes' && (
            <div className="space-y-4">
              <RrExceptionBoard items={exceptions} />
              <ul className="space-y-3">
                {snap.ofensores.slice(0, 6).map((o) => (
                  <li key={o.login} className="flex justify-between text-xl">
                    <span>{o.nome || o.login}</span>
                    <span className="font-bold uppercase text-rose-700">{o.nivel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {id === 'forecast' && (
            <div className="space-y-6">
              {forecast && mc ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  <Big label="Realista" value={n(forecast.realista)} />
                  <Big label="P50" value={n(mc.projecaoP50)} />
                  <Big label="P(meta)" value={`${mc.probabilidade}%`} />
                  <Big label="MTD" value={cmp ? n(cmp.mtdVendas) : '—'} />
                </div>
              ) : (
                <p className="text-slate-500">Sem série suficiente para forecast.</p>
              )}
              {briefing ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{briefing}</pre>
              ) : (
                <p className="text-slate-400">Gere o briefing IA na visão normal antes do war room.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="text-4xl font-black tabular-nums">{value}</p>
    </div>
  );
}
