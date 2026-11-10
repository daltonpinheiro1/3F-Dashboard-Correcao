import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import {
  enqueueScoreTim,
  lookupScoreTim,
  pollScoreTimResult,
  type ScoreTimResult,
} from '../lib/scoreTimService';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

type FormState = {
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
  uf: string;
  telefone: string;
  cep: string;
};

const EMPTY: FormState = {
  cpf: '',
  nome: '',
  data_nascimento: '',
  nome_mae: '',
  uf: 'SP',
  telefone: '',
  cep: '',
};

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return String(score);
}

export function ConsultaTimPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [result, setResult] = useState<ScoreTimResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onLookup = async () => {
    setErro('');
    setInfo('');
    const cpf = form.cpf.replace(/\D/g, '');
    if (cpf.length < 8) {
      setErro('Informe um CPF válido para buscar o cadastro.');
      return;
    }
    setLookupBusy(true);
    try {
      const hint = await lookupScoreTim(cpf);
      if (!hint.found) {
        setInfo('CPF não encontrado no cache local do bot (24h). Preencha manualmente.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        nome: hint.nome || prev.nome,
        data_nascimento: hint.data_nascimento || prev.data_nascimento,
        nome_mae: hint.nome_mae || prev.nome_mae,
        uf: (hint.uf || prev.uf).toUpperCase(),
        telefone: hint.telefone || prev.telefone,
      }));
      setInfo(
        hint.cache_fresh
          ? 'Dados preenchidos do cache (desfecho fresco < 24h — a consulta pode reaproveitar o score).'
          : 'Dados cadastrais preenchidos (cache antigo — a consulta fará crivo real).',
      );
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha no lookup');
    } finally {
      setLookupBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setInfo('');
    setResult(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const { query_id } = await enqueueScoreTim({
        cpf: form.cpf,
        nome: form.nome.trim(),
        data_nascimento: form.data_nascimento.trim(),
        nome_mae: form.nome_mae.trim(),
        uf: form.uf,
        telefone: form.telefone.trim(),
        cep: form.cep.trim(),
      });
      setInfo('Consulta enfileirada. Aguardando Crivo…');
      const final = await pollScoreTimResult(query_id, { signal: ac.signal });
      setResult(final);
      setInfo('');
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Consulta cancelada.') {
        setInfo('Consulta cancelada.');
      } else {
        setErro(err instanceof Error ? err.message : 'Falha na consulta TIM');
      }
    } finally {
      setLoading(false);
    }
  };

  const onCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const status = (result?.status || '').toUpperCase();

  return (
    <AdminLayout
      title="Consulta TIM"
      subtitle="Análise de crédito via bot Score (admin). Enfileira e acompanha o desfecho."
    >
      <div className="space-y-4">
        {erro && (
          <PageAlert variant="error" onDismiss={() => setErro('')}>
            {erro}
          </PageAlert>
        )}
        {info && !erro && (
          <PageAlert variant="info" onDismiss={() => setInfo('')}>
            {info}
          </PageAlert>
        )}

        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem]">
              <span className="block text-sm font-medium text-slate-700 mb-1">CPF</span>
              <input
                className="input-field"
                value={form.cpf}
                onChange={(ev) => setField('cpf', ev.target.value)}
                placeholder="000.000.000-00"
                required
                autoComplete="off"
                inputMode="numeric"
              />
            </label>
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              onClick={() => void onLookup()}
              disabled={lookupBusy || loading}
            >
              {lookupBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              Buscar cadastro
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Nome</span>
              <input
                className="input-field"
                value={form.nome}
                onChange={(ev) => setField('nome', ev.target.value)}
                required
              />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Data de nascimento
              </span>
              <input
                className="input-field"
                value={form.data_nascimento}
                onChange={(ev) => setField('data_nascimento', ev.target.value)}
                placeholder="DD/MM/AAAA"
                required
              />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">Nome da mãe</span>
              <input
                className="input-field"
                value={form.nome_mae}
                onChange={(ev) => setField('nome_mae', ev.target.value)}
                required
              />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">UF</span>
              <select
                className="input-field"
                value={form.uf}
                onChange={(ev) => setField('uf', ev.target.value)}
                required
              >
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">
                Telefone (opcional)
              </span>
              <input
                className="input-field"
                value={form.telefone}
                onChange={(ev) => setField('telefone', ev.target.value)}
                inputMode="tel"
              />
            </label>
            <label>
              <span className="block text-sm font-medium text-slate-700 mb-1">CEP (opcional)</span>
              <input
                className="input-field"
                value={form.cep}
                onChange={(ev) => setField('cep', ev.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              className="btn-primary inline-flex items-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden />
              )}
              {loading ? 'Consultando…' : 'Consultar crédito'}
            </button>
            {loading && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancelar espera
              </button>
            )}
          </div>
        </form>

        {result && (
          <div
            className={`card p-6 border ${
              status === 'APPROVED'
                ? 'border-emerald-300 bg-emerald-50/40'
                : status === 'REJECTED'
                  ? 'border-red-300 bg-red-50/40'
                  : 'border-amber-300 bg-amber-50/40'
            }`}
            role="status"
            aria-live="polite"
          >
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              {status === 'APPROVED' && 'Aprovado'}
              {status === 'REJECTED' && 'Reprovado'}
              {status === 'FAILED' && 'Falha operacional'}
              {status === 'INDETERMINATE' && 'Indeterminado'}
              {!['APPROVED', 'REJECTED', 'FAILED', 'INDETERMINATE'].includes(status) &&
                status}
            </h2>
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-slate-500">Score</dt>
                <dd className="font-semibold text-slate-900 text-xl">
                  {formatScore(result.score)}
                </dd>
              </div>
              {result.outcome_code && (
                <div>
                  <dt className="text-slate-500">Código</dt>
                  <dd className="font-mono text-slate-800">{result.outcome_code}</dd>
                </div>
              )}
              {result.rejection_reason && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">Motivo</dt>
                  <dd className="text-slate-900 whitespace-pre-wrap">
                    {result.rejection_reason}
                  </dd>
                </div>
              )}
              {result.latency_ms != null && (
                <div>
                  <dt className="text-slate-500">Latência</dt>
                  <dd>{Math.round(result.latency_ms / 1000)}s</dd>
                </div>
              )}
            </dl>
            {status === 'APPROVED' && Array.isArray(result.plans) && result.plans.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Planos</h3>
                <ul className="space-y-1 text-sm">
                  {result.plans.map((p, i) => (
                    <li key={`${p.nome}-${i}`} className="text-slate-800">
                      {p.nome}
                      {p.preco != null ? ` — R$ ${Number(p.preco).toFixed(2)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
