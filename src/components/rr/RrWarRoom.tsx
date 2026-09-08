import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from 'lucide-react';
import type { ForecastDia, MonteCarloDia } from '../../lib/horaPageData';
import { labelRrHorizonte, type RrHorizonte } from '../../lib/rrHorizonte';
import { labelGapRitmo } from '../../lib/rrExecutivo';
import type { RrSnapshot, RrSupRow } from '../../lib/rrExecutivo';
import type { RrComparativo } from '../../lib/rrComparativos';
import type { RrException } from '../../lib/rrExceptions';
import type { RrFunilEtapa } from '../../lib/rrFunil';
import type { RrFonteGap, RrOportunidade, RrSupGap } from '../../lib/rrOportunidades';
import type { RrPonte } from '../../lib/rrPonte';
import type { Rr360Bloco } from '../../lib/rr360';
import type { RrCulturaNome } from '../../lib/rrCultura';
import { slidesRrApresentacao } from '../../lib/rrVista';
import { RrBriefingView } from './RrBriefingView';
import { RrExceptionBoard } from './RrExceptionBoard';
import { RrFunilStrip } from './RrFunilStrip';

export const RR_TV_INTERVAL_MS = 20_000;
export const RR_TV_CASA_MS = 8_000;

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

type AcaoTv = { id: string; titulo: string; owner: string; prazo: string };

type Props = {
  dataRef: string;
  campanha: string;
  horizonte: RrHorizonte;
  isLive: boolean;
  snap: RrSnapshot;
  heroVendas: number;
  heroMeta: number;
  heroPct: number;
  heroGap: number;
  heroCpc: number;
  heroSups: Array<RrSupRow | RrSupGap>;
  ponte: RrPonte | null;
  fontes: RrFonteGap[];
  oportunidades: RrOportunidade[];
  acoesAbertas: AcaoTv[];
  rr360: Rr360Bloco | null;
  funil: RrFunilEtapa[];
  exceptions: RrException[];
  forecast: ForecastDia | null;
  mc: MonteCarloDia | null;
  cmp: RrComparativo | null;
  briefing: string;
  frase: string;
  podio: RrCulturaNome[];
  banco: RrCulturaNome[];
  onExit: () => void;
  kiosk?: boolean;
};

export function RrWarRoom({
  dataRef,
  campanha,
  horizonte,
  isLive,
  snap,
  heroVendas,
  heroMeta,
  heroPct,
  heroGap,
  heroCpc,
  heroSups,
  ponte,
  fontes,
  oportunidades,
  acoesAbertas,
  rr360,
  funil,
  exceptions,
  forecast,
  mc,
  cmp,
  briefing,
  frase,
  podio,
  banco,
  onExit,
  kiosk = false,
}: Props) {
  const slides = useMemo(
    () => slidesRrApresentacao({ isLive, temMix: Boolean(ponte?.mix.length) }),
    [isLive, ponte?.mix.length],
  );
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(!isLive);
  const len = slides.length || 1;
  const idx = Math.min(slide, len - 1);
  const id = slides[idx]?.id;
  const gapLabel = labelGapRitmo(heroGap);
  const dwell = id === 'casa' ? RR_TV_CASA_MS : RR_TV_INTERVAL_MS;

  useEffect(() => {
    setSlide((s) => Math.min(s, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % len), dwell);
    return () => window.clearInterval(t);
  }, [paused, len, dwell, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !kiosk) onExit();
      if (e.key === 'ArrowRight') setSlide((s) => (s + 1) % len);
      if (e.key === 'ArrowLeft') setSlide((s) => (s + len - 1) % len);
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      const num = Number(e.key);
      if (num >= 1 && num <= slides.length) setSlide(num - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, kiosk, len, slides.length]);

  const kpis: Array<[string, string, boolean?]> = [
    ['EVA janela', n(heroVendas)],
    ['Meta', n(heroMeta)],
    ['% meta', `${heroPct}%`, heroPct < 80],
    ['Gap', gapLabel.texto, heroGap < 0],
    ['CPC', `${heroCpc}%`, heroCpc < 50],
    ['Gross dia', rr360?.aplicavel ? n(rr360.vendasBrutas) : '—'],
    ['Logados', isLive ? n(snap.logados) : '—'],
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-slate-950 text-white">
      <div
        key={idx}
        className={`absolute inset-x-0 top-0 h-1 bg-sky-400 rr-tv-progress ${id === 'casa' ? 'rr-tv-progress-casa' : ''} ${paused ? 'rr-tv-progress-paused' : ''}`}
        aria-hidden
      />
      <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-5 sm:px-8">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              3F · RR {labelRrHorizonte(horizonte)} · {id === 'casa' ? '8s' : '20s'}
              {isLive ? ' · huddle' : ' · comitê pausado'} · setas / 1–{slides.length}
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {dataRef} · {campanha === 'TODAS' ? 'Port+Mig' : campanha}
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
          <button
            type="button"
            onClick={() => setSlide((s) => (s + len - 1) % len)}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Slide anterior"
          >
            <ChevronLeft size={18} />
          </button>
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSlide(i)}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                i === idx ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSlide((s) => (s + 1) % len)}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Próximo slide"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white p-6 text-gray-900">
          {id === 'casa' && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Frase da casa</p>
              <p
                className={`max-w-5xl text-3xl font-black leading-tight sm:text-5xl ${
                  heroGap < 0 ? 'text-amber-800' : heroGap > 0 ? 'text-emerald-800' : 'text-slate-900'
                }`}
              >
                {frase}
              </p>
            </div>
          )}

          {id === 'podio' && (
            <div className="grid min-w-0 gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-wide text-emerald-700">Pódio · puxam a fila</p>
                <ol className="space-y-4">
                  {podio.map((s, i) => (
                    <li key={s.supervisor} className="flex items-center justify-between gap-3 text-2xl">
                      <span className="truncate font-black">
                        {i + 1}º {s.supervisor}
                      </span>
                      <span className="shrink-0 tabular-nums text-emerald-800">{s.pctMeta}%</span>
                    </li>
                  ))}
                  {!podio.length ? <li className="text-slate-400">Sem time com meta.</li> : null}
                </ol>
              </div>
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-wide text-amber-700">Banco · não repetir o turno</p>
                <ol className="space-y-4">
                  {banco.map((s) => (
                    <li key={s.supervisor} className="flex items-center justify-between gap-3 text-2xl">
                      <span className="truncate font-black">{s.supervisor}</span>
                      <span className="shrink-0 tabular-nums text-amber-800">
                        {s.gap > 0 ? '+' : ''}
                        {n(s.gap)} · {s.pctMeta}%
                      </span>
                    </li>
                  ))}
                  {!banco.length ? (
                    <li className="text-xl text-emerald-700">Ninguém no banco.</li>
                  ) : null}
                </ol>
              </div>
            </div>
          )}

          {id === 'situacao' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpis.map(([l, v, warn]) => (
                <div key={l} className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{l}</p>
                  <p className={`mt-2 text-4xl font-black tabular-nums sm:text-5xl ${warn ? 'text-amber-700' : ''}`}>
                    {v}
                  </p>
                </div>
              ))}
            </div>
          )}

          {id === 'ponte' && (
            <div className="grid min-w-0 gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Mix comercial</p>
                <ul className="space-y-5">
                  {(ponte?.mix || []).map((f) => (
                    <li key={f.id}>
                      <div className="mb-1 flex items-end justify-between gap-3">
                        <span className="text-2xl font-black">{f.label}</span>
                        <span className={`text-2xl font-black tabular-nums ${f.gap < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {f.gap > 0 ? '+' : ''}
                          {n(f.gap)} · {f.pctMeta}%
                        </span>
                      </div>
                      <p className="mb-2 text-sm text-slate-500">
                        {n(f.vendas)} / meta {n(Math.round(f.meta))}
                      </p>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${f.gap < 0 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{
                            width: `${Math.min(100, (Math.abs(f.gap) / Math.max(1, ...ponte!.mix.map((x) => Math.abs(x.gap)))) * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">De onde veio o gap</p>
                {!fontes.length ? (
                  <p className="text-xl text-emerald-700">Nenhum supervisor abaixo neste recorte.</p>
                ) : (
                  <ul className="space-y-3">
                    {fontes.slice(0, 6).map((f) => (
                      <li key={f.label} className="flex items-center justify-between gap-3 text-xl">
                        <span className="truncate font-semibold">{f.label}</span>
                        <span className="shrink-0 tabular-nums text-amber-800">
                          {n(f.valor)} · {f.pct}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {oportunidades.length ? (
                  <ul className="mt-6 space-y-2 border-t border-slate-100 pt-4">
                    {oportunidades.slice(0, 4).map((o) => (
                      <li key={o.id} className="text-lg">
                        <span className="font-bold">{o.titulo}</span>
                        {o.impacto > 0 ? (
                          <span className="ml-2 tabular-nums text-violet-800">+{n(o.impacto)}</span>
                        ) : null}
                        <p className="text-sm text-slate-500">{o.detalhe}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          )}

          {id === 'sups' && (
            <ul className="space-y-3">
              {heroSups.slice(0, 8).map((s) => {
                const g = labelGapRitmo(s.gap);
                return (
                  <li key={s.supervisor} className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-2xl">
                    <span className="min-w-0 truncate font-semibold">{s.supervisor}</span>
                    <span className="shrink-0 tabular-nums">
                      {n(s.vendas)} · {s.pctMeta}%{' '}
                      <span className={g.abaixo ? 'text-amber-700' : g.acima ? 'text-emerald-700' : 'text-slate-400'}>
                        {g.texto}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {id === 'qualidade' && (
            <div className="space-y-6">
              <RrFunilStrip etapas={funil} />
              <RrExceptionBoard items={exceptions} />
              {isLive ? (
                <ul className="space-y-3">
                  {snap.ofensores.slice(0, 6).map((o) => (
                    <li key={o.login} className="flex justify-between text-xl">
                      <span>{o.nome || o.login}</span>
                      <span className="font-bold uppercase text-rose-700">{o.nivel}</span>
                    </li>
                  ))}
                  {!snap.ofensores.length ? <li className="text-slate-400">Sem ofensor P0/P1 no dia.</li> : null}
                </ul>
              ) : (
                <p className="text-slate-500">Ofensores são do huddle live — no comitê não misturar com a janela.</p>
              )}
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
                <p className="text-slate-500">Sem série suficiente para nowcast.</p>
              )}
            </div>
          )}

          {id === 'pauta' && (
            <div className="grid min-w-0 gap-8 lg:grid-cols-5">
              <div className="min-w-0 lg:col-span-3">
                <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Briefing</p>
                {briefing ? (
                  <RrBriefingView texto={briefing} size="lg" />
                ) : (
                  <p className="text-slate-400">Gere o briefing IA na visão Pauta antes da TV.</p>
                )}
              </div>
              <div className="lg:col-span-2">
                <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Ações abertas</p>
                {!acoesAbertas.length ? (
                  <p className="text-slate-400">Nenhuma ação aberta neste recorte.</p>
                ) : (
                  <ul className="space-y-3">
                    {acoesAbertas.slice(0, 6).map((a) => (
                      <li key={a.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-lg font-bold">{a.titulo}</p>
                        <p className="text-sm text-slate-500">
                          {a.owner} · {a.prazo}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
