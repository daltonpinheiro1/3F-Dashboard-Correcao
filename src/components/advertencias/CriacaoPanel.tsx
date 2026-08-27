import { useEffect, useMemo, useState } from 'react';
import { Eye, FileWarning, Plus, Sparkles } from 'lucide-react';
import { AdvertenciaPreviewModal } from '../AdvertenciaPreviewModal';
import {
  MOTIVOS_CATEGORIA,
  nivelPorIdx,
  podeAvancarNivel,
  requerAprovacaoDp,
  sugerirProximoNivel,
  sugerirReintegracao,
  type Advertencia,
} from '../../lib/advertenciasEscala';
import { resumoMedida } from '../../lib/escalaMedidaUi';
import { rotuloDocumentoSubmotivo, submotivosDoMotivo } from '../../lib/siscadMotivos';
import {
  createAdvertencia,
  historicoColaborador,
  niveisAplicados,
} from '../../lib/advertenciasService';
import { buildAdvertenciaDraft, canPreviewAdvertencia } from '../../lib/advertenciasDraft';
import { melhorarNarrativaAdvertencia } from '../../lib/advertenciasNarrativaIa';
import { fetchEvaLive } from '../../lib/evaDash';
import {
  buildOperadoresCatalog,
  filtrarOperadores,
  type OperadorSugestao,
} from '../../lib/operadoresCatalog';
import { Field } from './Field';
import { NivelMedidaSelector } from './NivelMedidaSelector';

export function CriacaoPanel({
  rows,
  listIncomplete = false,
  isRh,
  userName,
  userEmail,
  showForm,
  onShowForm,
  onCreated,
  onError,
}: {
  rows: Advertencia[];
  /** true quando ainda há páginas no servidor — histórico de nível pode estar incompleto */
  listIncomplete?: boolean;
  isRh: boolean;
  userName: string;
  userEmail: string;
  showForm: boolean;
  onShowForm: (v: boolean) => void;
  onCreated: (created: Advertencia, precisaAprovacao: boolean) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('');
  const [supervisorOp, setSupervisorOp] = useState('');
  const [categoria, setCategoria] = useState<string>(MOTIVOS_CATEGORIA[5]);
  const [submotivo, setSubmotivo] = useState('');
  const [motivoTexto, setMotivoTexto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataOcorrido, setDataOcorrido] = useState(() => new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [nivelIdx, setNivelIdx] = useState(0);
  const [nivelManual, setNivelManual] = useState(false);
  const [justPulo, setJustPulo] = useState('');
  const [ciencia, setCiencia] = useState(false);
  const [t1n, setT1n] = useState('');
  const [t1c, setT1c] = useState('');
  const [t2n, setT2n] = useState('');
  const [t2c, setT2c] = useState('');
  const [saving, setSaving] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaExplicacao, setIaExplicacao] = useState('');
  const [iaErro, setIaErro] = useState('');
  const [catalog, setCatalog] = useState<OperadorSugestao[]>([]);
  const [sugestoes, setSugestoes] = useState<OperadorSugestao[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<Advertencia | null>(null);

  const subOptions = useMemo(() => submotivosDoMotivo(categoria), [categoria]);
  const precisaDp = requerAprovacaoDp(nivelIdx);
  const podePrevia = canPreviewAdvertencia(categoria, submotivo);

  const formDraft = () => ({
    nome,
    matricula,
    cpf,
    cargo,
    categoria,
    submotivo,
    motivoTexto,
    descricao,
    dataOcorrido,
    nivelIdx,
    userName,
    userEmail,
    obs,
    supervisorOp,
    justPulo,
    ciencia,
    t1n,
    t1c,
    t2n,
    t2c,
  });

  useEffect(() => {
    const first = subOptions[0] || '';
    setSubmotivo(first);
    if (first) setMotivoTexto(rotuloDocumentoSubmotivo(first));
  }, [categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    setOpsLoading(true);
    void (async () => {
      try {
        const live = await fetchEvaLive();
        if (cancelled) return;
        setCatalog(buildOperadoresCatalog(live, rows));
      } catch {
        if (!cancelled) setCatalog(buildOperadoresCatalog(null, rows));
      } finally {
        if (!cancelled) setOpsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showForm, rows]);

  const hist = useMemo(() => historicoColaborador(rows, nome, matricula), [rows, nome, matricula]);
  const aplicados = useMemo(() => niveisAplicados(hist), [hist]);
  const sugerido = sugerirProximoNivel(aplicados);
  const ultima = hist[0]?.data_ocorrido || hist[0]?.created_at || null;
  const reintegrar = sugerirReintegracao(ultima);

  useEffect(() => {
    if (!nivelManual) setNivelIdx(sugerido);
  }, [sugerido, nivelManual]);

  const onNomeChange = (v: string) => {
    setNome(v);
    const list = filtrarOperadores(catalog, v, 12);
    setSugestoes(list);
    setShowSug(list.length > 0);
  };

  const escolherOperador = (op: OperadorSugestao) => {
    setNome(op.nome);
    setMatricula(op.matricula || op.login || '');
    if (op.cpf) setCpf(op.cpf);
    setCargo(op.cargo || 'Operador');
    setSupervisorOp(op.supervisor || '');
    // completa CPF/cargo do histórico mais recente se EVA não tiver
    const prev = historicoColaborador(rows, op.nome, op.matricula || op.login)[0];
    if (prev) {
      if (!op.cpf && prev.colaborador_cpf) setCpf(prev.colaborador_cpf);
      if (prev.colaborador_cargo) setCargo(prev.colaborador_cargo);
      if (prev.colaborador_matricula) setMatricula(prev.colaborador_matricula);
    }
    setSugestoes([]);
    setShowSug(false);
  };

  if (!showForm) {
    return (
      <div className="card p-8 text-center shadow-sm">
        <FileWarning className="mx-auto text-gray-300 mb-3" size={36} />
        <p className="text-sm text-gray-600 mb-2">
          Feedback e advertências geram PDF na hora. <strong>Suspensão e apuração jurídica</strong> vão para aprovação do DP.
        </p>
        <p className="text-xs text-gray-400 mb-4">Busca de operador com base no EVA + histórico de advertências.</p>
        <button type="button" className="btn-primary" onClick={() => onShowForm(true)}>
          <Plus size={14} className="inline mr-1" /> Abrir formulário
        </button>
      </div>
    );
  }

  const submit = async () => {
    onError('');
    const motivoFinal = (motivoTexto || rotuloDocumentoSubmotivo(submotivo)).trim();
    if (!nome.trim() || !descricao.trim() || !motivoFinal || !categoria) {
      onError('Preencha nome, motivo Siscad, submotivo e descrição detalhada.');
      return;
    }
    if (!submotivo) {
      onError('Selecione o submotivo (Siscad).');
      return;
    }
    const gate = podeAvancarNivel(nivelIdx, aplicados, isRh, justPulo);
    if (!gate.ok) {
      onError(gate.motivo || 'Progressão bloqueada');
      return;
    }
    const nivel = nivelPorIdx(nivelIdx);
    const precisaAprovacao = requerAprovacaoDp(nivel.idx);
    const base = buildAdvertenciaDraft(formDraft());
    setSaving(true);
    try {
      const created = await createAdvertencia({
        ...base,
        colaborador_nome: nome.trim(),
        descricao: descricao.trim(),
        status: precisaAprovacao ? 'pendente' : 'aprovada',
        entrega_status: precisaAprovacao ? 'aguardando_aprovacao' : 'aguardando_impressao',
        notificacao_status: 'desativada',
        aprovado_por_email: precisaAprovacao ? null : userEmail,
        aprovado_por_nome: precisaAprovacao ? null : userName,
        aprovado_em: precisaAprovacao ? null : new Date().toISOString(),
      });
      await onCreated(created, precisaAprovacao);
      setNome('');
      setMatricula('');
      setCpf('');
      setCargo('');
      setSupervisorOp('');
      setDescricao('');
      setObs('');
      setJustPulo('');
      setIaExplicacao('');
      setIaErro('');
      setNivelManual(false);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const aplicarIa = async () => {
    setIaErro('');
    setIaExplicacao('');
    if (descricao.trim().length < 12) {
      setIaErro('Escreva um rascunho do ocorrido (mín. 12 caracteres) antes de usar a IA.');
      return;
    }
    setIaLoading(true);
    try {
      const res = await melhorarNarrativaAdvertencia({
        rascunho: descricao,
        motivo: categoria,
        submotivo,
        nivelLabel: nivelPorIdx(nivelIdx).label,
        colaboradorNome: nome,
        dataOcorrido: dataOcorrido,
      });
      setDescricao(res.narrativa);
      setIaExplicacao(res.explicacao || 'Narrativa ajustada ao padrão jurídico do modelo oficial.');
    } catch (e: unknown) {
      setIaErro(e instanceof Error ? e.message : 'Falha ao chamar a IA');
    } finally {
      setIaLoading(false);
    }
  };

  return (
    <div className="card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Nova advertência</h3>
          <p className="text-[11px] text-gray-400">
            {precisaDp
              ? 'Suspensão → aprovação do DP antes da impressão'
              : 'Feedback/advertência → PDF liberado na hora'}
          </p>
        </div>
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => onShowForm(false)}>
          Fechar
        </button>
      </div>
      {listIncomplete && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Histórico local pode estar incompleto (ainda há páginas no servidor). Use{' '}
          <strong>Carregar mais</strong> no Controle DP ou confira a matrícula antes de avançar nível.
        </div>
      )}

      {reintegrar && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Reintegração sugerida: ≥6 meses sem ocorrências. Considere reiniciar a escala no Feedback Formal.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome do colaborador *">
          <div className="relative">
            <input
              className="input-field"
              value={nome}
              onChange={(e) => onNomeChange(e.target.value)}
              onFocus={() => {
                if (sugestoes.length) setShowSug(true);
              }}
              onBlur={() => {
                window.setTimeout(() => setShowSug(false), 180);
              }}
              placeholder={opsLoading ? 'Carregando operadores EVA…' : 'Digite nome, login ou matrícula'}
              autoComplete="off"
            />
            {showSug && sugestoes.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg text-sm">
                {sugestoes.map((op) => (
                  <li key={`${op.nome}-${op.login || op.matricula || ''}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-[#0f234b]/[0.06]"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => escolherOperador(op)}
                    >
                      <span className="font-medium text-gray-900 block">{op.nome}</span>
                      <span className="text-[10px] text-gray-500 block">
                        {[op.matricula || op.login ? `Mat/Login: ${op.matricula || op.login}` : null, op.supervisor ? `Sup: ${op.supervisor}` : null, op.fonte]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
        <Field label="Matrícula / Login">
          <input
            className="input-field"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="Preenchido ao escolher o operador"
          />
        </Field>
        <Field label="CPF">
          <input className="input-field" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </Field>
        <Field label="Cargo">
          <input
            className="input-field"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Ex.: Operador"
          />
        </Field>
        {supervisorOp ? (
          <p className="md:col-span-2 text-[11px] text-gray-500 -mt-1">
            Supervisor (EVA): <strong className="text-gray-700">{supervisorOp}</strong>
          </p>
        ) : null}
        <Field label="Motivo (Siscad / CLT) *">
          <select className="input-field" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {MOTIVOS_CATEGORIA.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Submotivo (Siscad) *">
          <select
            className="input-field"
            value={submotivo}
            onChange={(e) => {
              const v = e.target.value;
              setSubmotivo(v);
              setMotivoTexto(rotuloDocumentoSubmotivo(v));
            }}
          >
            {subOptions.length === 0 && <option value="">Sem submotivos</option>}
            {subOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data do ocorrido *">
          <input type="date" className="input-field" value={dataOcorrido} onChange={(e) => setDataOcorrido(e.target.value)} />
        </Field>
        <Field label="Texto no documento (editável)">
          <input
            className="input-field"
            value={motivoTexto}
            onChange={(e) => setMotivoTexto(e.target.value)}
            placeholder="Preenchido pelo submotivo; ajuste se necessário"
          />
        </Field>
      </div>

      {podePrevia && (
        <div className="rounded-xl border border-[#0f234b]/20 bg-[#0f234b]/[0.04] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-700 min-w-0">
            <p className="font-semibold text-[#0f234b]">Prévia do documento</p>
            <p className="text-gray-500 mt-0.5 truncate">
              {motivoTexto || rotuloDocumentoSubmotivo(submotivo)} — visualize o PDF antes de salvar ou imprimir.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 shrink-0"
            onClick={() => setPreviewDraft(buildAdvertenciaDraft(formDraft()))}
          >
            <Eye size={14} /> Ver prévia
          </button>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <label className="block text-xs font-semibold text-gray-500">Descrição do ocorrido *</label>
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            disabled={iaLoading}
            onClick={() => void aplicarIa()}
            title="Reescreve a narrativa em linguagem jurídica, sem alterar a cláusula CLT 482 do modelo"
          >
            <Sparkles size={13} className={iaLoading ? 'animate-pulse' : ''} />
            {iaLoading ? 'Ajustando narrativa…' : 'Melhorar com IA (jurídico)'}
          </button>
        </div>
        <textarea
          className="input-field min-h-[120px]"
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            if (iaExplicacao) setIaExplicacao('');
          }}
          placeholder="Rascunho dos fatos (data, conduta, impacto). Depois use a IA para deixar a narrativa pronta para a advertência."
        />
        <p className="mt-1 text-[10px] text-gray-400">
          A cláusula padrão do modelo (CLT art. 482) permanece imutável no PDF. A IA só aprimora esta narrativa factual.
        </p>
        {iaErro && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{iaErro}</div>
        )}
        {iaExplicacao && (
          <div className="mt-2 rounded-lg border border-[#0f234b]/20 bg-[#0f234b]/[0.04] px-3 py-2 text-xs text-gray-700">
            <p className="font-semibold text-[#0f234b] mb-0.5 flex items-center gap-1">
              <Sparkles size={12} /> O que a IA ajustou
            </p>
            <p className="leading-relaxed">{iaExplicacao}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-600 mb-3">
          Nível da medida · sugerido: <span className="text-[#0f234b]">{resumoMedida(sugerido)}</span>
          {hist.length > 0 ? ` · histórico: ${hist.length} registro(s)` : ' · sem histórico'}
        </p>
        <NivelMedidaSelector
          nivelIdx={nivelIdx}
          sugerido={sugerido}
          onChange={setNivelIdx}
          onManualChange={() => setNivelManual(true)}
        />
        {nivelIdx > sugerido && (
          <Field label="Justificativa de pulo de etapa (RH) *">
            <textarea
              className="input-field mt-2 min-h-[70px] bg-white"
              value={justPulo}
              onChange={(e) => setJustPulo(e.target.value)}
              placeholder="Obrigatório para RH pular etapas (mín. 20 caracteres)."
            />
          </Field>
        )}
      </div>

      <Field label="Observações">
        <textarea className="input-field min-h-[70px]" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={ciencia} onChange={(e) => setCiencia(e.target.checked)} />
          Ciência do colaborador solicitada / registrada
        </label>
        <p className="text-xs text-gray-400">Responsável: {userName} ({userEmail})</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Testemunha 1 — nome">
          <input className="input-field" value={t1n} onChange={(e) => setT1n(e.target.value)} />
        </Field>
        <Field label="Testemunha 1 — CPF">
          <input className="input-field" value={t1c} onChange={(e) => setT1c(e.target.value)} />
        </Field>
        <Field label="Testemunha 2 — nome">
          <input className="input-field" value={t2n} onChange={(e) => setT2n(e.target.value)} />
        </Field>
        <Field label="Testemunha 2 — CPF">
          <input className="input-field" value={t2c} onChange={(e) => setT2c(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={() => onShowForm(false)}>
          Cancelar
        </button>
        {podePrevia && (
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={() => setPreviewDraft(buildAdvertenciaDraft(formDraft()))}
          >
            <Eye size={14} /> Prévia
          </button>
        )}
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving
            ? 'Salvando…'
            : precisaDp
              ? 'Enviar suspensão ao DP'
              : 'Salvar e gerar PDF'}
        </button>
      </div>

      {previewDraft && (
        <AdvertenciaPreviewModal draft={previewDraft} onClose={() => setPreviewDraft(null)} />
      )}
    </div>
  );
}
