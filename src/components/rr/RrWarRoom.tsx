import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastDia, MonteCarloDia } from '../../lib/horaPageData';
import {
  RR_HORIZONTE_OPTIONS,
  labelMesYm,
  labelRrHorizonte,
  type RrHorizonte,
} from '../../lib/rrHorizonte';
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
  mesYm?: string;
  janelaLabel?: string;
  mesesOpcoes?: string[];
  onHorizonte?: (id: string) => void;
  onMes?: (ym: string) => void;
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
  mesYm,
  janelaLabel,
  mesesOpcoes = [],
  onHorizonte,
  onMes,
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
  const gapLabel = isLive
    ? labelGapRitmo(heroGap)
    : {
        texto:
          heroGap > 0
            ? `Acima da meta +${heroGap}`
            : heroGap < 0
              ? `Abaixo da meta ${heroGap}`
              : 'Meta atingida',
        acima: heroGap > 0,
        abaixo: heroGap < 0,
      };
  const dwell = id === 'casa' ? RR_TV_CASA_MS : RR_TV_INTERVAL_MS;
  const tituloJanela =
    janelaLabel || (horizonte === 'mensal' && mesYm ? labelMesYm(mesYm) : dataRef);
  const chartSups = useMemo(
    () =>
      heroSups.slice(0, 8).map((s) => ({
        nome: s.supervisor.length > 18 ? `${s.supervisor.slice(0, 16)}…` : s.supervisor,
        vendas: s.vendas,
        meta: Math.round(s.metaDia),
        pct: s.pctMeta,
        gap: s.gap,
      })),
    [heroSups],
  );
  const pctBar = Math.max(0, Math.min(100, heroPct));

  useEffect(() => {
    setSlide((s) => Math.min(s, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  useEffect(() => {
    setPaused(!isLive);
  }, [isLive]);

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
    ['Gross dia', isLive && rr360?.aplicavel ? n(rr360.vendasBrutas) : '—'],
    ['Logados', isLive ? n(snap.logados) : '—'],
  ];

  return (
    <div
      className="fixed inset-0 z-[90] overflow-hidden bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="War room RR"
    >
      <div
        key={idx}
        className={`absolute inset-x-0 top-0 h-1 bg-sky-400 rr-tv-progress ${id === 'casa' ? 'rr-tv-progress-casa' : ''} ${paused ? 'rr-tv-progress-paused' : ''}`}
        aria-hidden
      />
      <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-5 sm:px-8">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              3F · RR {labelRrHorizonte(horizonte)}
              {horizonte === 'mensal' && mesYm ? ` · ${labelMesYm(mesYm)}` : ''} · {id === 'casa' ? '8s' : '20s'}
              {isLive ? ' · huddle' : ' · comitê pausado'} · setas / 1–{slides.length}
            </p>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {tituloJanela} · {campanha === 'TODAS' ? 'Port+Mig' : campanha}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onHorizonte
              ? RR_HORIZONTE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onHorizonte(o.id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      o.id === horizonte ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {o.label}
                  </button>
                ))
              : null}
            {horizonte === 'mensal' && onMes ? (
              <>
                <input
                  type="month"
                  value={mesYm || ''}
                  max={dataRef.slice(0, 7) || undefined}
                  min="2025-01"
                  onChange={(e) => onMes(e.target.value)}
                  className="rounded-lg border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
                  aria-label="Mês calendário da RR TV"
                />
                {mesesOpcoes.map((ym) => (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => onMes(ym)}
                    className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                      ym === mesYm ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {ym.slice(5)}/{ym.slice(2, 4)}
                  </button>
                ))}
              </>
            ) : null}
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
                    <li key={s.supervisor}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-lg sm:text-xl">
                        <span className="min-w-0 font-black">
                          {i + 1}º {s.supervisor}
                        </span>
                        <span className="shrink-0 tabular-nums text-emerald-800">{s.pctMeta}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(4, Math.min(100, s.pctMeta))}%` }}
                        />
                      </div>
                    </li>
                  ))}
                  {!podio.length ? <li className="text-slate-400">Sem time com meta.</li> : null}
                </ol>
              </div>
              <div>
                <p className="mb-4 text-sm font-bold uppercase tracking-wide text-amber-700">Banco · não repetir o turno</p>
                <ol className="space-y-4">
                  {banco.map((s) => (
                    <li key={s.supervisor}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-lg sm:text-xl">
                        <span className="min-w-0 font-black">{s.supervisor}</span>
                        <span className="shrink-0 tabular-nums text-amber-800">
                          {s.gap > 0 ? '+' : ''}
                          {n(s.gap)} · {s.pctMeta}%
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.max(4, Math.min(100, Math.abs(s.pctMeta)))}%` }}
                        />
                      </div>
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
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">% da meta da janela</p>
                  <p className={`text-4xl font-black tabular-nums ${heroPct < 80 ? 'text-amber-700' : 'text-emerald-800'}`}>
                    {heroPct}%
                  </p>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${heroPct < 80 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${pctBar}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {n(heroVendas)} / meta {n(heroMeta)} · {gapLabel.texto}
                </p>
              </div>
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
            <div className="grid min-w-0 gap-6 lg:grid-cols-5">
              <div className="min-h-[280px] min-w-0 lg:col-span-3">
                <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Vendas × meta</p>
                {chartSups.length ? (
                  <div className="h-[280px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartSups} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="nome" width={128} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="meta" name="Meta" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="vendas" name="Vendas" fill="#0f766e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-slate-400">Sem supervisores neste recorte.</p>
                )}
              </div>
              <ul className="space-y-2 lg:col-span-2">
                {heroSups.slice(0, 8).map((s) => {
                  const g = labelGapRitmo(s.gap);
                  return (
                    <li key={s.supervisor} className="border-b border-slate-100 py-2">
                      <div className="flex items-start justify-between gap-3 text-sm sm:text-base">
                        <span className="min-w-0 font-semibold leading-snug">{s.supervisor}</span>
                        <span className="shrink-0 tabular-nums">
                          {n(s.vendas)} · {s.pctMeta}%
                        </span>
                      </div>
                      <p className={`text-sm ${g.abaixo ? 'text-amber-700' : g.acima ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {g.texto} {s.gap !== 0 ? n(s.gap) : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {id === 'qualidade' && (
            <div className="space-y-6">
              {isLive ? (
                <>
                  <RrFunilStrip etapas={funil} />
                  <RrExceptionBoard items={exceptions} />
                  <ul className="space-y-3">
                    {snap.ofensores.slice(0, 6).map((o) => (
                      <li key={o.login} className="flex justify-between text-xl">
                        <span>{o.nome || o.login}</span>
                        <span className="font-bold uppercase text-rose-700">{o.nivel}</span>
                      </li>
                    ))}
                    {!snap.ofensores.length ? <li className="text-slate-400">Sem ofensor P0/P1 no dia.</li> : null}
                  </ul>
                </>
              ) : (
                <p className="text-lg text-slate-500">
                  Funil Gross, TIM do dia e ofensores ficam no huddle live. No comitê a qualidade da janela é CPC {heroCpc}% e gap {gapLabel.texto}.
                </p>
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
