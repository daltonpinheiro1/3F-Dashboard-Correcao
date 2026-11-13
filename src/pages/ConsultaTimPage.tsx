import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Eraser,
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
  applyCpfIdentityChange,
  applyPhoneIdentityChange,
} from '../lib/consultaTimIdentity';
import {
  timelineStepsFromProgress,
} from '../lib/consultaTimTimeline';
import { explainScoreOutcome } from '../lib/scoreTimExplain';
import {
  enqueueScoreTim,
  getScoreTimQueue,
  isRetryableEnqueueError,
  isRetryableOperationalFailure,
  isTerminalStatus,
  lookupScoreTimCpf,
  waitScoreTimResult,
  type ScoreTimLookupHint,
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

function statusMeta(status: string, outcomeCode?: string | null) {
  const s = status.toUpperCase();
  const code = (outcomeCode || '').toUpperCase();
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
    const crivo = code.includes('CRIVO');
    return {
      label: crivo ? 'Crivo TIM instável' : 'Falha operacional',
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

/** Mensagem única para fila/poll (wait_reason > phase; hot nunca vira AUTH). */
function processingWaitMessage(partial: ScoreTimResult): string {
  const phase = (partial.phase || '').toUpperCase();
  const wait = (partial.wait_reason || '').toUpperCase();
  const hot = partial.session_hot === true;
  if (wait === 'NETWORK_RETRY') {
    return 'Instabilidade na rede TIM, reconsultando…';
  }
  if (wait === 'SESSION_REFRESH' || wait === 'SSO') {
    return 'Aquecendo sessão (RSA/IAM)…';
  }
  if (wait === 'QUERY' || phase === 'QUERY') {
    return 'Consultando Crivo no Siebel…';
  }
  // Fallback legado: phase=AUTH só se sessão fria / desconhecida.
  if (phase === 'AUTH' && !hot) {
    return 'Aquecendo sessão (RSA/IAM)…';
  }
  if (phase === 'AUTH' && hot) {
    return 'Instabilidade na rede TIM, reconsultando…';
  }
  return 'Bot processando no Siebel…';
}

function queueWaitLabel(partial: ScoreTimResult | null): string {
  if (!partial) return 'Na fila…';
  const status = (partial.status || '').toUpperCase();
  if (partial.cached) return 'Resultado em cache…';
  if (status === 'PROCESSING') {
    return processingWaitMessage(partial);
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
  absoluteHint?: number | null,
): number | null {
  // Preferência: ETA absoluto do poll (fase AUTH/QUERY ou fila já calculada no bot).
  if (typeof absoluteHint === 'number' && absoluteHint > 0) {
    return Math.max(15, Math.min(900, absoluteHint));
  }
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
  absoluteHint?: number | null,
): string | null {
  const sec = etaSeconds(ahead, perQueryHint, absoluteHint);
  if (sec == null) return null;
  return `${etaMinutesLabel(sec)} estimado`;
}

/** Valor curto para o cartão "Estimado" (sempre em minutos). */
function etaCardValue(
  ahead: number | null | undefined,
  perQueryHint?: number | null,
  absoluteHint?: number | null,
): string {
  const sec = etaSeconds(ahead, perQueryHint, absoluteHint);
  if (sec == null) return '—';
  return etaMinutesLabel(sec);
}

/** Motivo operacional legível (esconde WinError longo na UI). */
function friendlyReason(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/WinError\s*-2147467238|identidade configurada/i.test(raw)) {
    return 'RSA indisponível: a API precisa rodar na sessão do usuário Windows. Aguarde a recuperação e tente de novo.';
  }
  if (/Fila acima do limite|temporariamente sobrecarregado/i.test(raw)) {
    return 'Fila operacional cheia. Aguarde alguns minutos e tente de novo (o sistema libera vagas automaticamente).';
  }
  if (/Circuit breaker aberto/i.test(raw)) {
    return 'Proteção temporária ativa após falhas seguidas no Crivo/Siebel. Aguarde ~1–2 min e consulte de novo.';
  }
  if (/Erro de comunica[cç][aã]o com o Crivo/i.test(raw)) {
    return 'O Crivo da TIM está instável no momento. Tente novamente em instantes — não é reprovação de crédito.';
  }
  if (/Erro de rede no passo|ClientError|Connection refused|TimeoutError|CancelledError/i.test(raw)) {
    return 'Instabilidade na rede TIM/Siebel. O bot reconsulta sem novo login RSA — aguarde e reenvie se persistir.';
  }
  if (/sem SRN|Sessao Siebel morta|sessão Siebel morta|GotoPostedAction/i.test(raw)) {
    return 'Sessão Siebel inválida. O bot renova RSA/IAM automaticamente — aguarde ou reenvie em instantes.';
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
  const [cacheOffer, setCacheOffer] = useState<ScoreTimLookupHint | null>(null);
  const [sessionWarmHint, setSessionWarmHint] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const modalOpenedForRef = useRef<string | null>(null);
  const cpfLookupDebounceRef = useRef<number>(0);
  /**
   * Segurança de identidade: após consultar / trocar identidades completas,
   * um campo zera o outro. Preenchimento inicial mantém celular+CPF juntos.
   */
  const identityBoundRef = useRef(false);
  const lastCompleteCpfRef = useRef('');
  const lastCompletePhoneRef = useRef('');

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
      window.clearTimeout(cpfLookupDebounceRef.current);
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

  /** Nova consulta: cancela poll e limpa resultado/fila pessoal/alertas. */
  const resetConsultaUi = useCallback((opts?: { abort?: boolean }) => {
    if (opts?.abort !== false) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setErro('');
    setInfo('');
    setResult(null);
    setWaitProgress(null);
    setResultModalOpen(false);
    setCacheOffer(null);
    setSessionWarmHint(false);
    modalOpenedForRef.current = null;
  }, []);

  const openTerminalResult = useCallback((final: ScoreTimResult) => {
    const qid = final.query_id || '';
    setResult(final);
    setWaitProgress(null);
    setInfo('');
    if (modalOpenedForRef.current !== qid) {
      modalOpenedForRef.current = qid;
      setResultModalOpen(true);
    }
  }, []);

  const onPhoneChange = (raw: string) => {
    const next = formatBrMobile(raw);
    const nextDigits = phoneDigits(next);
    setForm((prev) => {
      const prevDigits = phoneDigits(prev.telefone);
      const applied = applyPhoneIdentityChange({
        prev,
        nextFormatted: next,
        nextDigits,
        prevDigits,
        identityBound: identityBoundRef.current,
        lastCompletePhone: lastCompletePhoneRef.current,
        lastCompleteCpf: lastCompleteCpfRef.current,
        isValidPhone: isValidBrMobile,
      });
      identityBoundRef.current = applied.identityBound;
      lastCompletePhoneRef.current = applied.lastCompletePhone;
      lastCompleteCpfRef.current = applied.lastCompleteCpf;
      if (applied.clearUi) {
        queueMicrotask(() => resetConsultaUi());
      }
      return applied.form;
    });
  };

  const applyLookupHint = useCallback(
    async (cpfValue: string) => {
      const digits = cpfValue.replace(/\D/g, '');
      if (digits.length !== 11 || cpfError(cpfValue)) return;
      try {
        const hint = await lookupScoreTimCpf(digits);
        if (!mountedRef.current) return;
        if (!hint.found) {
          setCacheOffer(null);
          return;
        }
        // Se o usuário já mudou o CPF enquanto o lookup rodava, não reaplica.
        setForm((prev) => {
          if (prev.cpf.replace(/\D/g, '') !== digits) return prev;
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
          const userPhoneOk = phoneDigits(prev.telefone).length >= 10;
          const hintPhone = (hint.telefone || '').replace(/\D/g, '');
          return {
            ...prev,
            nome: hint.nome?.trim() ? clampPersonName(hint.nome) : prev.nome,
            nome_mae: hint.nome_mae?.trim()
              ? clampPersonName(hint.nome_mae)
              : prev.nome_mae,
            data_nascimento: nasc || prev.data_nascimento,
            telefone: userPhoneOk
              ? prev.telefone
              : hintPhone.length >= 10
                ? formatBrMobile(hint.telefone!)
                : prev.telefone,
          };
        });
        const st = (hint.status || '').toUpperCase();
        if (
          hint.cache_fresh &&
          (st === 'APPROVED' || st === 'REJECTED')
        ) {
          setCacheOffer(hint);
          setInfo('');
        } else {
          setCacheOffer(null);
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
        }
        // Lookup dispara session_prefetch no bot — feedback se sessão fria.
        try {
          const snap = await getScoreTimQueue();
          if (!mountedRef.current) return;
          if (snap.session_hot === false || snap.session_refreshing) {
            setSessionWarmHint(true);
          } else if (snap.session_hot === true) {
            setSessionWarmHint(false);
          }
        } catch {
          /* best-effort */
        }
      } catch {
        /* lookup é best-effort */
      }
    },
    [],
  );

  const onCpfChange = (raw: string) => {
    const next = formatCpfMask(raw);
    const nextDigits = next.replace(/\D/g, '');
    setForm((prev) => {
      const prevDigits = prev.cpf.replace(/\D/g, '');
      const applied = applyCpfIdentityChange({
        prev,
        nextFormatted: next,
        nextDigits,
        prevDigits,
        identityBound: identityBoundRef.current,
        lastCompleteCpf: lastCompleteCpfRef.current,
        lastCompletePhone: lastCompletePhoneRef.current,
      });
      identityBoundRef.current = applied.identityBound;
      lastCompleteCpfRef.current = applied.lastCompleteCpf;
      lastCompletePhoneRef.current = applied.lastCompletePhone;
      if (applied.clearUi) {
        queueMicrotask(() => resetConsultaUi());
      }
      return applied.form;
    });
    window.clearTimeout(cpfLookupDebounceRef.current);
    if (nextDigits.length === 11 && !cpfError(next)) {
      cpfLookupDebounceRef.current = window.setTimeout(() => {
        void applyLookupHint(next);
      }, 400);
    } else {
      setCacheOffer(null);
    }
  };

  const onCpfBlur = (cpfRaw?: string) => {
    window.clearTimeout(cpfLookupDebounceRef.current);
    void applyLookupHint(cpfRaw ?? form.cpf);
  };

  const runConsulta = async (opts?: { forceLive?: boolean }) => {
    setErro('');
    setInfo('');
    setResult(null);
    setWaitProgress(null);
    setCacheOffer(null);
    modalOpenedForRef.current = null;

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
    // A partir daqui o par celular+CPF está vinculado à consulta.
    identityBoundRef.current = true;
    lastCompleteCpfRef.current = form.cpf.replace(/\D/g, '');
    lastCompletePhoneRef.current = phoneDigits(form.telefone);
    setLoading(true);

    const clearTransientUi = () => {
      setResult(null);
      setWaitProgress(null);
      setErro('');
      modalOpenedForRef.current = null;
    };

    const runOnce = async (): Promise<ScoreTimResult> => {
      const enqueued = await enqueueScoreTim({
        cpf: form.cpf.replace(/\D/g, ''),
        nome,
        data_nascimento: dataNasc,
        nome_mae: nomeMae,
        uf,
        telefone: form.telefone,
        force_live: opts?.forceLive === true,
      });
      const { query_id } = enqueued;
      if (enqueued.cached && !opts?.forceLive) {
        // Aceite cache via POST — ainda precisamos do status completo.
        setInfo('Resultado em cache — carregando desfecho…');
      } else {
        setWaitProgress({
          query_id,
          status: 'QUEUED',
          queue_ahead: enqueued.queue_ahead ?? null,
          queue_position: enqueued.queue_position ?? null,
          queue_depth: enqueued.queue_depth ?? null,
        });
        setInfo(
          opts?.forceLive
            ? 'Reconsulta Crivo enfileirada…'
            : 'Consulta enfileirada. Acompanhe a posição na fila…',
        );
      }
      void refreshQueue();
      return waitScoreTimResult(query_id, {
        signal: ac.signal,
        onProgress: (partial) => {
          if (!mountedRef.current) return;
          if (isTerminalStatus(partial.status)) {
            openTerminalResult(partial);
            return;
          }
          setWaitProgress(partial);
          const ahead = partial.queue_ahead;
          const status = (partial.status || '').toUpperCase();
          if (status === 'PROCESSING') {
            const eta = etaHintLabel(
              0,
              queueLive?.eta_hint_query_seconds ?? queueLive?.eta_hint_seconds,
              partial.eta_hint_seconds,
            );
            const base = processingWaitMessage(partial);
            setInfo(eta ? `${base.replace(/…$/, '')} · ${eta}` : base);
          } else if (typeof ahead === 'number') {
            const eta = etaHintLabel(
              ahead,
              queueLive?.eta_hint_query_seconds ?? queueLive?.eta_hint_seconds,
              partial.eta_hint_seconds,
            );
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
            /rede|timeout|TIM_WS|call_validations|ClientError/i.test(
              `${final.rejection_reason || ''} ${final.outcome_code || ''}`,
            )
              ? `Instabilidade na rede TIM — reconsultando (${attempt}/${MAX_OPERATIONAL_RETRIES})…`
              : `Sessão/RSA indisponível — aguardando recuperação e consultando novamente (${attempt}/${MAX_OPERATIONAL_RETRIES})…`,
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
      openTerminalResult(final);
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runConsulta();
  };

  const onUseCache = () => {
    if (!cacheOffer) return;
    const st = (cacheOffer.status || '').toUpperCase();
    if (st !== 'APPROVED' && st !== 'REJECTED') return;
    const explained = explainScoreOutcome({
      status: st,
      outcome_code: cacheOffer.outcome_code,
      rejection_reason: cacheOffer.rejection_reason,
    });
    const synthetic: ScoreTimResult = {
      query_id: `cache-${form.cpf.replace(/\D/g, '')}`,
      status: st,
      score: cacheOffer.score ?? null,
      outcome_code: cacheOffer.outcome_code ?? explained.factors[0]?.code ?? null,
      rejection_reason: cacheOffer.rejection_reason ?? null,
      purchase_limit: cacheOffer.purchase_limit ?? null,
      cached: true,
    };
    setCacheOffer(null);
    setSessionWarmHint(false);
    openTerminalResult(synthetic);
  };

  const onForceLive = () => {
    setCacheOffer(null);
    void runConsulta({ forceLive: true });
  };

  const onCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const onClearForm = () => {
    if (loading) {
      abortRef.current?.abort();
      setLoading(false);
    }
    identityBoundRef.current = false;
    lastCompleteCpfRef.current = '';
    lastCompletePhoneRef.current = '';
    setForm(EMPTY);
    setErro('');
    setInfo('');
    setResult(null);
    setWaitProgress(null);
    setResultModalOpen(false);
    setCacheOffer(null);
    setSessionWarmHint(false);
    modalOpenedForRef.current = null;
    window.requestAnimationFrame(() => {
      document.getElementById(`${formId}-tel`)?.focus();
    });
  };

  const formDirty =
    Boolean(form.telefone || form.cpf || form.nome || form.data_nascimento || form.nome_mae) ||
    Boolean(result || erro || info);

  const meta = result ? statusMeta(result.status, result.outcome_code) : null;
  const StatusIcon = meta?.Icon;
  const errId = `${formId}-erro`;
  const explain = result
    ? explainScoreOutcome({
        status: result.status,
        outcome_code: result.outcome_code,
        rejection_reason: result.rejection_reason,
      })
    : null;
  const timelineSteps = timelineStepsFromProgress(
    loading ? waitProgress : result,
  );
  const queueRefreshLabel = loading
    ? 'Atualiza a cada 8s durante consulta'
    : 'Atualiza a cada 3s';
  const sessionPill =
    queueLive?.session_refreshing === true
      ? { label: 'Renovando sessão', cls: 'bg-amber-100 text-amber-900' }
      : queueLive?.session_hot === true
        ? { label: 'Sessão quente', cls: 'bg-emerald-100 text-emerald-800' }
        : queueLive?.session_hot === false
          ? { label: 'Sessão fria', cls: 'bg-slate-100 text-slate-700' }
          : null;
  const cacheExplain = cacheOffer
    ? explainScoreOutcome({
        status: cacheOffer.status,
        outcome_code: cacheOffer.outcome_code,
        rejection_reason: cacheOffer.rejection_reason,
      })
    : null;

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
        {sessionWarmHint && !loading && !erro && (
          <PageAlert variant="info" onDismiss={() => setSessionWarmHint(false)}>
            Aquecendo sessão em segundo plano…
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
                <p className="text-xs text-slate-500">
                  {queueRefreshLabel} · sem dados pessoais
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sessionPill && (
                <span className={`badge ${sessionPill.cls}`}>{sessionPill.label}</span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            </div>
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
                      ? etaCardValue(
                          waitProgress?.queue_ahead,
                          queueLive?.eta_hint_query_seconds ??
                            queueLive?.eta_hint_seconds,
                          waitProgress?.eta_hint_seconds,
                        )
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-3 space-y-3 fade-slide-up">
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-50/80 px-3 py-2.5 text-sm text-blue-900 ring-1 ring-blue-100">
                <Timer className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                <span className="font-medium">{queueWaitLabel(waitProgress)}</span>
              </div>
              <ol
                className="grid grid-cols-4 gap-2"
                aria-label="Progresso da consulta"
              >
                {timelineSteps.map((step) => (
                  <li
                    key={step.id}
                    className={`rounded-xl px-2 py-2 text-center ring-1 ${
                      step.state === 'active'
                        ? 'bg-blue-600 text-white ring-blue-600'
                        : step.state === 'done'
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
                          : 'bg-slate-50 text-slate-400 ring-slate-100'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide opacity-80">
                      {step.state === 'done'
                        ? 'ok'
                        : step.state === 'active'
                          ? 'agora'
                          : '—'}
                    </p>
                    <p className="text-xs font-semibold">{step.label}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {cacheOffer && cacheExplain && !loading && (
          <section
            className="card p-4 sm:p-5 border border-sky-100 bg-sky-50/40 card-enter"
            aria-label="Resultado em cache"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Resultado em cache (24h)
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {cacheExplain.headline}
                  {cacheOffer.score != null ? ` · score ${cacheOffer.score}` : ''}
                </p>
                <ul className="mt-2 space-y-1">
                  {cacheExplain.factors.map((f) => (
                    <li key={f.code} className="text-xs text-slate-700">
                      · {f.title}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={onUseCache}>
                  Usar cache
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onForceLive}
                >
                  Reconsultar Crivo
                </button>
              </div>
            </div>
          </section>
        )}

        <form
          onSubmit={onSubmit}
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
                onChange={(ev) => onCpfChange(ev.target.value)}
                onBlur={(ev) => void onCpfBlur(ev.currentTarget.value)}
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
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={onClearForm}
              disabled={!formDirty && !loading}
              aria-label="Limpar formulário e resultado na tela"
            >
              <Eraser className="h-4 w-4" aria-hidden />
              Limpar
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
            title={explain?.headline || meta.label}
            subtitle={
              result.cached
                ? 'Servido do cache 24h'
                : result.outcome_code || result.status
            }
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

              {explain && explain.factors.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {explain.factors.map((f) => (
                    <li
                      key={f.code}
                      className="rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-black/5"
                    >
                      <p className="text-sm font-medium text-slate-900">{f.title}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{f.detail}</p>
                      {f.cta && (
                        <p className="mt-1.5 text-xs font-medium text-blue-700">{f.cta}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                {friendlyReason(result.rejection_reason) &&
                  !explain?.factors.some((f) => f.detail) && (
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
            </div>
          </ModalShell>
        )}
      </div>
    </AdminLayout>
  );
}
