import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  XCircle,
  AlertTriangle,
  Users,
  Timer,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { ModalShell, PageAlert } from '../components/ui';
import {
  birthDateError,
  brMobileError,
  clampPersonName,
  cpfError,
  formatBirthMask,
  formatBrMobile,
  formatCpfMask,
  isValidBrMobile,
  normalizeBirthDate,
  phoneDigits,
  ufFromPhone,
} from '../lib/brPhone';
import {
  enqueueScoreTim,
  getScoreTimQueue,
  isRetryableEnqueueError,
  isRetryableOperationalFailure,
  lookupScoreTimCpf,
  pollScoreTimResult,
  type ScoreTimPlan,
  type ScoreTimQueueSnapshot,
  type ScoreTimResult,
} from '../lib/scoreTimService';

const MAX_OPERATIONAL_RETRIES = 2;
const RETRY_DELAY_MS = 8000;

type FormState = {
  telefone: string;
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
};

const EMPTY: FormState = {
  telefone: '',
  cpf: '',
  nome: '',
  data_nascimento: '',
  nome_mae: '',
};

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return String(score);
}

function statusMeta(status: string) {
  const s = status.toUpperCase();
  if (s === 'APPROVED') {
    return {
      label: 'Aprovado',
      Icon: CheckCircle2,
      shell: 'border-emerald-200/80 from-emerald-50/90 via-white to-white',
      badge: 'bg-emerald-100 text-emerald-800',
      icon: 'text-emerald-600',
    };
  }
  if (s === 'REJECTED') {
    return {
      label: 'Reprovado',
      Icon: XCircle,
      shell: 'border-red-200/80 from-red-50/90 via-white to-white',
      badge: 'bg-red-100 text-red-800',
      icon: 'text-red-600',
    };
  }
  if (s === 'FAILED') {
    return {
      label: 'Falha operacional',
      Icon: AlertTriangle,
      shell: 'border-amber-200/80 from-amber-50/90 via-white to-white',
      badge: 'bg-amber-100 text-amber-900',
      icon: 'text-amber-600',
    };
  }
  return {
    label: s === 'INDETERMINATE' ? 'Indeterminado' : s || 'Resultado',
    Icon: AlertTriangle,
    shell: 'border-slate-200 from-slate-50 via-white to-white',
    badge: 'bg-slate-100 text-slate-700',
    icon: 'text-slate-500',
  };
}

/** Fallback se o bot ainda não mandar eta_hint_seconds (SLO p50). */
const SECONDS_PER_QUERY_FALLBACK = 90;

function queueWaitLabel(partial: ScoreTimResult | null): string {
  if (!partial) return 'Na fila…';
  const status = (partial.status || '').toUpperCase();
  const phase = (partial.phase || '').toUpperCase();
  if (partial.cached) return 'Resultado em cache…';
  if (status === 'PROCESSING') {
    if (phase === 'AUTH') return 'Autenticando no Siebel (RSA/IAM)…';
    if (phase === 'QUERY') return 'Consultando crédito no Siebel…';
    return 'Bot processando no Siebel…';
  }
  const ahead = partial.queue_ahead;
  if (typeof ahead === 'number') {
    if (ahead === 0) return 'Você é o próximo da fila…';
    return ahead === 1
      ? '1 consulta na frente'
      : `${ahead} consultas na frente`;
  }
  return 'Aguardando na fila…';
}

function perQuerySeconds(hint: number | null | undefined): number {
  if (typeof hint === 'number' && hint > 0) return Math.max(45, Math.min(180, hint));
  return SECONDS_PER_QUERY_FALLBACK;
}

function etaSeconds(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
): number | null {
  if (typeof ahead !== 'number' || ahead < 0) return null;
  const unit = perQuerySeconds(perQueryHint);
  return Math.max(unit, (ahead + 1) * unit);
}

function etaMinutesLabel(sec: number): string {
  const mins = Math.max(1, Math.ceil(sec / 60));
  return mins === 1 ? '~1 min' : `~${mins} min`;
}

function etaHintLabel(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
): string | null {
  const sec = etaSeconds(ahead, perQueryHint);
  if (sec == null) return null;
  return `${etaMinutesLabel(sec)} estimado`;
}

/** Valor curto para o cartão "Estimado" (sempre em minutos). */
function etaCardValue(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
): string {
  const sec = etaSeconds(ahead, perQueryHint);
  if (sec == null) return '—';
  return etaMinutesLabel(sec);
}

/** Motivo operacional legível (esconde WinError longo na UI). */
function friendlyReason(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/WinError\s*-2147467238|identidade configurada/i.test(raw)) {
    return 'RSA indisponível: a API precisa rodar na sessão do usuário Windows. Aguarde a recuperação e tente de novo.';
  }
  if (/RSA indisponivel|RSA indisponível|falha ao relogar/i.test(raw) && raw.length > 180) {
    return 'Falha operacional ao autenticar no Siebel (RSA/sessão). Tente novamente em instantes.';
  }
  return raw;
}

export function ConsultaTimPage() {
  const formId = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreTimResult | null>(null);
  const [queueLive, setQueueLive] = useState<ScoreTimQueueSnapshot | null>(null);
  const [queueErr, setQueueErr] = useState('');
  const [waitProgress, setWaitProgress] = useState<ScoreTimResult | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ddd = phoneDigits(form.telefone).slice(0, 2);
  const ufHint = useMemo(() => ufFromPhone(form.telefone), [form.telefone]);
  const phoneOk = isValidBrMobile(form.telefone);

  const mountedRef = useRef(true);

  const refreshQueue = useCallback(async () => {
    try {
      const snap = await getScoreTimQueue();
      if (!mountedRef.current) return;
      setQueueLive(snap);
      setQueueErr('');
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setQueueErr(e instanceof Error ? e.message : 'Fila indisponível');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Painel live: pausa com aba oculta; durante consulta o poll de status já traz progresso.
  useEffect(() => {
    let cancelled = false;
    let id = 0;

    const tick = async () => {
      if (cancelled || document.hidden) return;
      await refreshQueue();
    };

    const arm = () => {
      window.clearInterval(id);
      if (document.hidden) return;
      void tick();
      // Enquanto consulta roda, onProgress já atualiza — intervalo maior (menos rate-limit).
      id = window.setInterval(() => void tick(), loading ? 8000 : 3000);
    };

    arm();
    const onVis = () => arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshQueue, loading]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onPhoneChange = (raw: string) => {
    setField('telefone', formatBrMobile(raw));
  };

  const onCpfBlur = async () => {
    const digits = form.cpf.replace(/\D/g, '');
    if (digits.length !== 11 || cpfError(form.cpf)) return;
    try {
      const hint = await lookupScoreTimCpf(digits);
      if (!mountedRef.current || !hint.found) return;
      setForm((prev) => {
        const nascRaw = (hint.data_nascimento || '').trim();
        let nasc = prev.data_nascimento;
        if (nascRaw) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(nascRaw)) {
            const [y, m, d] = nascRaw.split('-');
            nasc = formatBirthMask(`${d}${m}${y}`);
          } else {
            nasc = formatBirthMask(nascRaw.replace(/\D/g, ''));
          }
        }
        return {
          ...prev,
          nome: hint.nome?.trim() ? clampPersonName(hint.nome) : prev.nome,
          nome_mae: hint.nome_mae?.trim()
            ? clampPersonName(hint.nome_mae)
            : prev.nome_mae,
          data_nascimento: nasc,
          telefone:
            (hint.telefone || '').replace(/\D/g, '').length >= 10
              ? formatBrMobile(hint.telefone!)
              : prev.telefone,
        };
      });
      if (hint.cache_fresh) {
        const bits = [
          hint.status ? `último: ${hint.status}` : '',
          hint.score != null ? `score ${hint.score}` : '',
        ].filter(Boolean);
        setInfo(
          bits.length
            ? `Cadastro encontrado no cache (${bits.join(' · ')}).`
            : 'Cadastro encontrado no cache.',
        );
      } else if (hint.nome) {
        setInfo('Dados do CPF preenchidos automaticamente.');
      }
    } catch {
      /* lookup é best-effort */
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setInfo('');
    setResult(null);
    setWaitProgress(null);

    const phoneErr = brMobileError(form.telefone);
    if (phoneErr) {
      setErro(phoneErr);
      return;
    }
    const cpfErr = cpfError(form.cpf);
    if (cpfErr) {
      setErro(cpfErr);
      return;
    }
    const birthErr = birthDateError(form.data_nascimento);
    if (birthErr) {
      setErro(birthErr);
      return;
    }
    const nome = clampPersonName(form.nome);
    const nomeMae = clampPersonName(form.nome_mae);
    if (!nome || !nomeMae) {
      setErro('Preencha nome e nome da mãe.');
      return;
    }
    const uf = ufHint;
    if (!uf) {
      setErro('UF inválida. Confira o DDD do celular.');
      return;
    }
    const dataNasc = normalizeBirthDate(form.data_nascimento)!;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);

    const clearTransientUi = () => {
      setResult(null);
      setWaitProgress(null);
      setErro('');
    };

    const runOnce = async (): Promise<ScoreTimResult> => {
      const enqueued = await enqueueScoreTim({
        cpf: form.cpf.replace(/\D/g, ''),
        nome,
        data_nascimento: dataNasc,
        nome_mae: nomeMae,
        uf,
        telefone: form.telefone,
      });
      const { query_id } = enqueued;
      setWaitProgress({
        query_id,
        status: 'QUEUED',
        queue_ahead: enqueued.queue_ahead ?? null,
        queue_position: enqueued.queue_position ?? null,
        queue_depth: enqueued.queue_depth ?? null,
      });
      setInfo('Consulta enfileirada. Acompanhe a posição na fila…');
      void refreshQueue();
      return pollScoreTimResult(query_id, {
        signal: ac.signal,
        onProgress: (partial) => {
          if (!mountedRef.current) return;
          setWaitProgress(partial);
          const ahead = partial.queue_ahead;
          const status = (partial.status || '').toUpperCase();
          if (status === 'PROCESSING') {
            const phase = (partial.phase || '').toUpperCase();
            setInfo(
              phase === 'AUTH'
                ? 'Autenticando no Siebel (RSA/IAM)…'
                : phase === 'QUERY'
                  ? 'Consultando crédito no Siebel…'
                  : 'Bot processando (login Siebel + consulta)…',
            );
          } else if (typeof ahead === 'number') {
            const eta = etaHintLabel(ahead, queueLive?.eta_hint_seconds);
            setInfo(
              ahead === 0
                ? `Você é o próximo da fila${eta ? ` · ${eta}` : ''}…`
                : ahead === 1
                  ? `1 consulta na frente${eta ? ` · ${eta}` : ''}`
                  : `${ahead} consultas na frente${eta ? ` · ${eta}` : ''}`,
            );
          }
        },
      });
    };

    try {
      let attempt = 0;
      let final: ScoreTimResult | null = null;
      while (attempt <= MAX_OPERATIONAL_RETRIES) {
        if (ac.signal.aborted) throw new Error('Consulta cancelada.');
        try {
          final = await runOnce();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Falha na consulta TIM';
          if (msg === 'Consulta cancelada.') throw err;
          if (
            attempt < MAX_OPERATIONAL_RETRIES &&
            isRetryableEnqueueError(msg)
          ) {
            attempt += 1;
            clearTransientUi();
            setInfo(
              `Falha operacional — limpando e tentando de novo (${attempt}/${MAX_OPERATIONAL_RETRIES})…`,
            );
            await new Promise<void>((resolve, reject) => {
              const t = window.setTimeout(resolve, RETRY_DELAY_MS);
              const onAbort = () => {
                window.clearTimeout(t);
                reject(new Error('Consulta cancelada.'));
              };
              ac.signal.addEventListener('abort', onAbort, { once: true });
            });
            continue;
          }
          throw err;
        }

        if (
          final &&
          isRetryableOperationalFailure(final) &&
          attempt < MAX_OPERATIONAL_RETRIES
        ) {
          attempt += 1;
          clearTransientUi();
          setInfo(
            `Sessão/RSA indisponível — aguardando recuperação e consultando novamente (${attempt}/${MAX_OPERATIONAL_RETRIES})…`,
          );
          await new Promise<void>((resolve, reject) => {
            const t = window.setTimeout(resolve, RETRY_DELAY_MS);
            const onAbort = () => {
              window.clearTimeout(t);
              reject(new Error('Consulta cancelada.'));
            };
            ac.signal.addEventListener('abort', onAbort, { once: true });
          });
          continue;
        }
        break;
      }

      if (!mountedRef.current || !final) return;
      setResult(final);
      setResultModalOpen(true);
      setWaitProgress(null);
      setInfo('');
      void refreshQueue();
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setWaitProgress(null);
      if (err instanceof Error && err.message === 'Consulta cancelada.') {
        setInfo('Consulta cancelada.');
      } else {
        setErro(err instanceof Error ? err.message : 'Falha na consulta TIM');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const onCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const meta = result ? statusMeta(result.status) : null;
  const StatusIcon = meta?.Icon;
  const errId = `${formId}-erro`;

  return (
    <AdminLayout
      title="Consulta TIM"
      subtitle="Crédito em tempo real · PDV pelo DDD do celular"
    >
      <div className="space-y-5 max-w-3xl">
        {erro && (
          <PageAlert variant="error" onDismiss={() => setErro('')}>
            <span id={errId}>{erro}</span>
          </PageAlert>
        )}
        {info && !erro && (
          <PageAlert variant="info" onDismiss={() => setInfo('')}>
            {info}
          </PageAlert>
        )}

        <section
          className="relative overflow-hidden rounded-2xl border border-white/10 card-enter"
          style={{
            background:
              'linear-gradient(135deg, rgb(var(--brand-navy)) 0%, rgb(20 48 98) 48%, rgb(13 92 255 / 0.92) 100%)',
          }}
          aria-label="Resumo da consulta TIM"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgb(255 255 255 / 0.22), transparent 42%), radial-gradient(circle at 88% 10%, rgb(147 197 253 / 0.35), transparent 36%)',
            }}
          />
          <div className="relative flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 text-white" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold tracking-tight">Análise Score TIM</p>
              <p className="text-sm text-blue-100/90">
                Celular define a regional do PDV · CPF só para o Crivo
              </p>
            </div>
            {phoneOk && ufHint && (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm fade-slide-up">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                DDD {ddd} · UF {ufHint}
              </div>
            )}
          </div>
        </section>

        <section
          className="card p-4 sm:p-5 card-enter hover-lift ring-highlight"
          style={{ animationDelay: '40ms' }}
          aria-live="polite"
          aria-label="Fila de consultas em tempo real"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Users className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Fila ao vivo</p>
                <p className="text-xs text-slate-500">Atualiza a cada 3s · sem dados pessoais</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>

          {queueErr && !queueLive ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 ring-1 ring-amber-100">
              {queueErr}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Na fila</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 number-transition">
                    {queueLive?.queue_depth ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Aguardando</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 number-transition">
                    {queueLive?.pending ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Em Crivo</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 number-transition">
                    {queueLive?.processing ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Capacidade</p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900 number-transition">
                    {queueLive?.queue_max ?? '—'}
                  </p>
                </div>
              </div>

              <div
                className={`grid grid-cols-3 gap-3 rounded-xl p-1 transition-colors ${
                  loading ? 'bg-blue-50/70 ring-1 ring-blue-100' : ''
                }`}
                aria-live="polite"
              >
                <div
                  className={`rounded-xl px-3 py-2.5 ring-1 ${
                    loading
                      ? 'bg-white ring-blue-100'
                      : 'bg-slate-50 ring-slate-100'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">A sua</p>
                  <p
                    className={`text-2xl font-bold tabular-nums number-transition ${
                      loading ? 'text-blue-700' : 'text-slate-900'
                    }`}
                  >
                    {loading && typeof waitProgress?.queue_position === 'number'
                      ? waitProgress.queue_position
                      : '—'}
                  </p>
                </div>
                <div
                  className={`rounded-xl px-3 py-2.5 ring-1 ${
                    loading
                      ? 'bg-white ring-blue-100'
                      : 'bg-slate-50 ring-slate-100'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">À frente</p>
                  <p
                    className={`text-2xl font-bold tabular-nums number-transition ${
                      loading ? 'text-blue-700' : 'text-slate-900'
                    }`}
                  >
                    {loading && typeof waitProgress?.queue_ahead === 'number'
                      ? waitProgress.queue_ahead
                      : '—'}
                  </p>
                </div>
                <div
                  className={`rounded-xl px-3 py-2.5 ring-1 ${
                    loading
                      ? 'bg-white ring-blue-100'
                      : 'bg-slate-50 ring-slate-100'
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Estimado</p>
                  <p
                    className={`text-xl sm:text-2xl font-bold tabular-nums number-transition ${
                      loading ? 'text-blue-700' : 'text-slate-900'
                    }`}
                  >
                    {loading
                      ? etaCardValue(waitProgress?.queue_ahead, queueLive?.eta_hint_seconds)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50/80 px-3 py-2.5 text-sm text-blue-900 ring-1 ring-blue-100 fade-slide-up">
              <Timer className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span className="font-medium">{queueWaitLabel(waitProgress)}</span>
            </div>
          )}
        </section>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="card p-5 sm:p-6 space-y-5 card-enter hover-lift ring-highlight"
          style={{ animationDelay: '60ms' }}
          aria-busy={loading || undefined}
          aria-describedby={erro ? errId : undefined}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`${formId}-tel`} className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Phone className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                Celular
              </label>
              <input
                id={`${formId}-tel`}
                className="input-field tracking-wide"
                value={form.telefone}
                onChange={(ev) => onPhoneChange(ev.target.value)}
                placeholder="(11) 98765-4321"
                required
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={form.telefone.length > 0 && !phoneOk ? true : undefined}
                aria-describedby={`${formId}-tel-hint`}
              />
              <p id={`${formId}-tel-hint`} className="mt-1.5 text-xs text-slate-500">
                DDD + 9 dígitos. A regional do PDV sai do DDD — CEP não é necessário.
              </p>
            </div>

            <div>
              <label htmlFor={`${formId}-cpf`} className="mb-1.5 block text-sm font-medium text-slate-700">
                CPF
              </label>
              <input
                id={`${formId}-cpf`}
                className="input-field tracking-wide"
                value={form.cpf}
                onChange={(ev) => setField('cpf', formatCpfMask(ev.target.value))}
                onBlur={() => void onCpfBlur()}
                placeholder="000.000.000-00"
                required
                autoComplete="off"
                inputMode="numeric"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">UF (pelo DDD)</span>
              <div
                className="input-field flex items-center gap-2 bg-slate-50 text-slate-700"
                aria-live="polite"
              >
                <MapPin className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />
                {ufHint ? (
                  <span className="font-semibold tracking-wide">
                    {ufHint}
                    <span className="ml-2 font-normal text-slate-500">DDD {ddd}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">Preencha o celular</span>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor={`${formId}-nome`} className="mb-1.5 block text-sm font-medium text-slate-700">
                Nome completo
              </label>
              <input
                id={`${formId}-nome`}
                className="input-field"
                value={form.nome}
                onChange={(ev) => setField('nome', ev.target.value)}
                required
                autoComplete="name"
                maxLength={120}
              />
            </div>

            <div>
              <label htmlFor={`${formId}-nasc`} className="mb-1.5 block text-sm font-medium text-slate-700">
                Data de nascimento
              </label>
              <input
                id={`${formId}-nasc`}
                className="input-field"
                value={form.data_nascimento}
                onChange={(ev) => setField('data_nascimento', formatBirthMask(ev.target.value))}
                placeholder="DD/MM/AAAA"
                required
                inputMode="numeric"
                autoComplete="bday"
              />
            </div>

            <div>
              <label htmlFor={`${formId}-mae`} className="mb-1.5 block text-sm font-medium text-slate-700">
                Nome da mãe
              </label>
              <input
                id={`${formId}-mae`}
                className="input-field"
                value={form.nome_mae}
                onChange={(ev) => setField('nome_mae', ev.target.value)}
                required
                autoComplete="off"
                maxLength={120}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="submit"
              className="btn-primary inline-flex items-center gap-2 min-w-[11rem]"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {loading ? 'Consultando…' : 'Consultar crédito'}
            </button>
            {loading && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancelar espera
              </button>
            )}
            {!loading && phoneOk && ufHint && (
              <p className="text-xs text-slate-500 fade-slide-up">
                PDV regional · {ufHint} (DDD {ddd})
              </p>
            )}
          </div>

          {loading && (
            <div
              className="overflow-hidden rounded-xl bg-slate-100/80 fade-slide-up"
              role="progressbar"
              aria-label="Aguardando resposta do Crivo"
            >
              <div
                className="h-1 origin-left rounded-xl bg-gradient-to-r from-blue-500 via-sky-400 to-blue-600"
                style={{ animation: 'rr-tv-progress 2.4s linear infinite' }}
              />
            </div>
          )}
        </form>

        {result && meta && StatusIcon && !resultModalOpen && (
          <button
            type="button"
            onClick={() => setResultModalOpen(true)}
            className={`card w-full overflow-hidden border bg-gradient-to-br p-4 text-left card-enter hover-lift ${meta.shell}`}
            aria-label="Abrir resultado da consulta"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 ${meta.icon}`}
              >
                <StatusIcon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{meta.label}</span>
                  <span className={`badge ${meta.badge}`}>{result.status}</span>
                </div>
                <p className="text-xs text-slate-500">Toque para ver o detalhe</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Score</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {formatScore(result.score)}
                </p>
              </div>
            </div>
          </button>
        )}

        {result && meta && StatusIcon && resultModalOpen && (
          <ModalShell
            title={meta.label}
            subtitle={result.outcome_code || result.status}
            size="lg"
            badge={<span className={`badge ${meta.badge}`}>{result.status}</span>}
            onClose={() => setResultModalOpen(false)}
            footer={
              <button
                type="button"
                className="btn-primary"
                onClick={() => setResultModalOpen(false)}
              >
                Fechar
              </button>
            }
          >
            <div className={`rounded-2xl border bg-gradient-to-br p-4 sm:p-5 ${meta.shell}`}>
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 ${meta.icon}`}
                >
                  <StatusIcon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-600">Resultado da consulta TIM</p>
                  {result.query_id && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {result.query_id}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Score</p>
                  <p className="number-transition text-3xl font-bold tabular-nums text-slate-900">
                    {formatScore(result.score)}
                  </p>
                </div>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                {friendlyReason(result.rejection_reason) && (
                  <div className="sm:col-span-2 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5">
                    <dt className="text-slate-500">Motivo</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">
                      {friendlyReason(result.rejection_reason)}
                    </dd>
                  </div>
                )}
                {result.latency_ms != null && (
                  <div>
                    <dt className="text-slate-500">Latência</dt>
                    <dd className="font-medium text-slate-800">
                      {Math.round(result.latency_ms / 1000)}s
                    </dd>
                  </div>
                )}
              </dl>

              {meta.label === 'Aprovado' &&
                Array.isArray(result.plans) &&
                result.plans.length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">
                      Planos disponíveis
                    </h3>
                    <ul className="space-y-2">
                      {result.plans.map((p: ScoreTimPlan, i: number) => (
                        <li
                          key={`${p.nome}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2.5 text-sm ring-1 ring-emerald-100"
                        >
                          <span className="font-medium text-slate-800">{p.nome}</span>
                          {p.preco != null && (
                            <span className="tabular-nums text-emerald-700">
                              R$ {Number(p.preco).toFixed(2)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </ModalShell>
        )}
      </div>
    </AdminLayout>
  );
}
