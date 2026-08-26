import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileWarning,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { useAuthStore } from '../store/authStore';
import {
  ESCALA_PEDAGOGICA,
  MOTIVOS_CATEGORIA,
  escalaCritica,
  nivelPorIdx,
  podeAvancarNivel,
  sugerirProximoNivel,
  sugerirReintegracao,
  type Advertencia,
} from '../lib/advertenciasEscala';
import { rotuloDocumentoSubmotivo, submotivosDoMotivo } from '../lib/siscadMotivos';
import {
  STATUS_CLS,
  STATUS_LABEL,
  advertenciasStorageMode,
  createAdvertencia,
  historicoColaborador,
  kpisAdvertencias,
  listAdvertencias,
  niveisAplicados,
  updateAdvertenciaStatus,
} from '../lib/advertenciasService';
import { downloadPdfBlob, gerarPdfAdvertencia } from '../lib/advertenciasPdf';
import { melhorarNarrativaAdvertencia } from '../lib/advertenciasNarrativaIa';

type SubTab = 'criacao' | 'controle';

export function AdvertenciasPage() {
  const { userRole, userName, userEmail } = useAuthStore();
  const isRh = userRole === 'admin';
  const [tab, setTab] = useState<SubTab>('controle');
  const [rows, setRows] = useState<Advertencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [detail, setDetail] = useState<Advertencia | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [storageMode, setStorageMode] = useState<'api' | 'local' | 'supabase'>('supabase');

  // filtros controle
  const [fStatus, setFStatus] = useState('');
  const [fColab, setFColab] = useState('');
  const [fNivel, setFNivel] = useState('');
  const [fCriticos, setFCriticos] = useState(false);
  const [fDe, setFDe] = useState('');
  const [fAte, setFAte] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const reload = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await listAdvertencias();
      setRows(data);
      setStorageMode(advertenciasStorageMode());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar advertências');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const kpis = useMemo(() => kpisAdvertencias(rows), [rows]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      if (fCriticos && !escalaCritica(r.nivel_idx)) return false;
      if (!fCriticos && fNivel !== '' && String(r.nivel_idx) !== fNivel) return false;
      if (fColab) {
        const q = fColab.toLowerCase();
        const blob = `${r.colaborador_nome} ${r.colaborador_matricula || ''} ${r.criado_por_nome || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (fDe && r.data_ocorrido < fDe) return false;
      if (fAte && r.data_ocorrido > fAte) return false;
      return true;
    });
  }, [rows, fStatus, fColab, fNivel, fCriticos, fDe, fAte]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const pageRows = filtradas.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [fStatus, fColab, fNivel, fCriticos, fDe, fAte, pageSize]);

  const aprovar = async (id: string) => {
    try {
      const updated = await updateAdvertenciaStatus(id, {
        status: 'aprovada',
        aprovado_por_email: userEmail,
        aprovado_por_nome: userName,
        aprovado_em: new Date().toISOString(),
      });
      if (!updated) {
        setErro('Não foi possível aprovar. Tente novamente.');
        return;
      }
      setOkMsg('Advertência aprovada.');
      setErro('');
      setDetail(null);
      await reload();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao aprovar');
    }
  };

  const recusar = async (id: string) => {
    const motivo = window.prompt('Motivo da recusa / devolução:') || '';
    if (!motivo.trim()) return;
    try {
      const updated = await updateAdvertenciaStatus(id, {
        status: 'recusada',
        recusa_motivo: motivo,
        aprovado_por_email: userEmail,
        aprovado_por_nome: userName,
        aprovado_em: new Date().toISOString(),
      });
      if (!updated) {
        setErro('Não foi possível recusar. Tente novamente.');
        return;
      }
      setOkMsg('Advertência recusada / devolvida.');
      setErro('');
      setDetail(null);
      await reload();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao recusar');
    }
  };

  const emitirPdf = async (a: Advertencia) => {
    try {
      const blob = await gerarPdfAdvertencia(a);
      downloadPdfBlob(blob, `advertencia_${(a.colaborador_matricula || a.colaborador_nome).replace(/\s+/g, '_')}.pdf`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar PDF');
    }
  };

  return (
    <AdminLayout
      title="Gestão de Advertências"
      subtitle="Escala pedagógica · Motivos Siscad · Acesso temporário: somente Admin"
    >
      {(erro || okMsg) && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            erro ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {erro || okMsg}
        </div>
      )}

      {storageMode === 'local' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Modo local ativo. Aplique a migration no projeto Dashboard (
          <code>ayhrwxsxqddpeukydblz</code>) — arquivo <code>012b_advertencias_dashboard.sql</code>.
        </div>
      )}
      {storageMode === 'api' && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          Persistência via API Storage (tabela <code>advertencias</code> ainda não visível no PostgREST do Dashboard).
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="Pendentes de aprovação"
          value={kpis.pendentes}
          warn={kpis.pendentes > 0}
          icon={AlertTriangle}
        />
        <Kpi label="Advertências no mês" value={kpis.noMes} icon={FileText} />
        <Kpi label="Suspensões ativas" value={kpis.suspensoesAtivas} icon={ShieldAlert} />
        <Kpi
          label="Escala máxima (crítico)"
          value={kpis.criticos}
          warn={kpis.criticos > 0}
          critical={kpis.criticos > 0}
          icon={FileWarning}
        />
      </div>

      {kpis.criticos > 0 && (
        <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-red-800">Alerta · colaboradores em estágio crítico</p>
            <p className="text-xs text-red-700">
              Suspensão de 5 dias ou Apuração do DP. Avalie relatório jurídico / desligamento.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => {
              setTab('controle');
              setFNivel('');
              setFCriticos(true);
            }}
          >
            Ver críticos
          </button>
        </div>
      )}

      <div className="card p-3 shadow-sm mb-4 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <SegBtn active={tab === 'criacao'} onClick={() => setTab('criacao')} label="Criação" />
          <SegBtn active={tab === 'controle'} onClick={() => setTab('controle')} label="Controle (RH)" />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => void reload()}>
            <RefreshCw size={14} className="inline mr-1" /> Atualizar
          </button>
          <button
            type="button"
            className="btn-primary text-sm py-2 px-3"
            onClick={() => {
              setTab('criacao');
              setShowForm(true);
            }}
          >
            <Plus size={14} className="inline mr-1" /> Criar Nova Advertência
          </button>
        </div>
      </div>

      {tab === 'criacao' && (
        <CriacaoPanel
          rows={rows}
          isRh={isRh}
          userName={userName}
          userEmail={userEmail}
          showForm={showForm}
          onShowForm={setShowForm}
          onCreated={async () => {
            setShowForm(false);
            setOkMsg('Advertência enviada para aprovação.');
            setErro('');
            setTab('controle');
            await reload();
          }}
          onError={setErro}
        />
      )}

      {tab === 'controle' && (
        <div className="card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              className="input-field"
              placeholder="Buscar colaborador / responsável"
              value={fColab}
              onChange={(e) => setFColab(e.target.value)}
            />
            <select className="input-field" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">Todos status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={fCriticos ? '__criticos__' : fNivel}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__criticos__') {
                  setFCriticos(true);
                  setFNivel('');
                } else {
                  setFCriticos(false);
                  setFNivel(v);
                }
              }}
            >
              <option value="">Todos níveis</option>
              <option value="__criticos__">Somente críticos (nível 10–11)</option>
              {ESCALA_PEDAGOGICA.map((n) => (
                <option key={n.idx} value={String(n.idx)}>
                  {n.idx + 1}. {n.label}
                </option>
              ))}
            </select>
            <input type="date" className="input-field" value={fDe} onChange={(e) => setFDe(e.target.value)} />
            <input type="date" className="input-field" value={fAte} onChange={(e) => setFAte(e.target.value)} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Responsável</th>
                  <th className="text-left px-3 py-2">Motivo</th>
                  <th className="text-left px-3 py-2">Nível</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma advertência neste filtro.
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-50 ${escalaCritica(r.nivel_idx) ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2 tabular-nums text-gray-600">{fmtDate(r.data_ocorrido)}</td>
                    <td className="px-3 py-2 font-medium">
                      {r.colaborador_nome}
                      {r.colaborador_matricula ? (
                        <span className="block text-[10px] text-gray-400">Mat. {r.colaborador_matricula}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.criado_por_nome || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <span className="block text-xs font-medium">{r.motivo_categoria}</span>
                      <span className="block text-[10px] text-gray-500 line-clamp-2">{r.motivo_texto}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.nivel_label}</td>
                    <td className="px-3 py-2">
                      <span className={`badge ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-1">
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setDetail(r)}>
                        Ver
                      </button>
                      {isRh && r.status === 'pendente' && (
                        <>
                          <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => void aprovar(r.id)}>
                            Aprovar
                          </button>
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void recusar(r.id)}>
                            Recusar
                          </button>
                        </>
                      )}
                      <button type="button" className="text-xs text-gray-700 hover:underline" onClick={() => void emitirPdf(r)}>
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              {filtradas.length} registro(s) · página {page}/{totalPages}
            </span>
            <div className="flex items-center gap-2">
              <select
                className="input-field py-1 w-24"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}/pág
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary py-1 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-2"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <DetailModal
          item={detail}
          hist={historicoColaborador(rows, detail.colaborador_nome, detail.colaborador_matricula || undefined)}
          isRh={isRh}
          onClose={() => setDetail(null)}
          onAprovar={() => void aprovar(detail.id)}
          onRecusar={() => void recusar(detail.id)}
          onPdf={() => void emitirPdf(detail)}
        />
      )}
    </AdminLayout>
  );
}

function CriacaoPanel({
  rows,
  isRh,
  userName,
  userEmail,
  showForm,
  onShowForm,
  onCreated,
  onError,
}: {
  rows: Advertencia[];
  isRh: boolean;
  userName: string;
  userEmail: string;
  showForm: boolean;
  onShowForm: (v: boolean) => void;
  onCreated: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('');
  const [categoria, setCategoria] = useState<string>(MOTIVOS_CATEGORIA[5]); // DESIDIA (mais comum no Siscad)
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

  const subOptions = useMemo(() => submotivosDoMotivo(categoria), [categoria]);

  useEffect(() => {
    const first = subOptions[0] || '';
    setSubmotivo(first);
    if (first) setMotivoTexto(rotuloDocumentoSubmotivo(first));
  }, [categoria]); // eslint-disable-line react-hooks/exhaustive-deps -- só ao mudar motivo

  const hist = useMemo(() => historicoColaborador(rows, nome, matricula), [rows, nome, matricula]);
  const aplicados = useMemo(() => niveisAplicados(hist), [hist]);
  const sugerido = sugerirProximoNivel(aplicados);
  const ultima = hist[0]?.data_ocorrido || hist[0]?.created_at || null;
  const reintegrar = sugerirReintegracao(ultima);

  useEffect(() => {
    if (!nivelManual) setNivelIdx(sugerido);
  }, [sugerido, nivelManual]);

  if (!showForm) {
    return (
      <div className="card p-8 text-center shadow-sm">
        <FileWarning className="mx-auto text-gray-300 mb-3" size={36} />
        <p className="text-sm text-gray-600 mb-4">
          Cadastro com motivos/submotivos do Siscad. Por enquanto restrito a Admin; supervisores serão liberados depois.
        </p>
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
    setSaving(true);
    try {
      await createAdvertencia({
        colaborador_nome: nome.trim(),
        colaborador_matricula: matricula.trim() || null,
        colaborador_cpf: cpf.trim() || null,
        colaborador_cargo: cargo.trim() || null,
        motivo_categoria: categoria,
        motivo_texto: motivoFinal,
        descricao: descricao.trim(),
        data_ocorrido: dataOcorrido,
        nivel_idx: nivel.idx,
        nivel_codigo: nivel.codigo,
        nivel_label: nivel.label,
        dias_suspensao: nivel.diasSuspensao,
        status: 'pendente',
        criado_por_email: userEmail,
        criado_por_nome: userName,
        observacoes_supervisor: obs.trim() || null,
        justificativa_pulo: justPulo.trim() || null,
        ciencia_colaborador: ciencia,
        testemunha1_nome: t1n.trim() || null,
        testemunha1_cpf: t1c.trim() || null,
        testemunha2_nome: t2n.trim() || null,
        testemunha2_cpf: t2c.trim() || null,
        anexos: [],
      });
      await onCreated();
      setNome('');
      setMatricula('');
      setCpf('');
      setCargo('');
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
          <p className="text-[11px] text-gray-400">Motivos e submotivos importados do Siscad 3.6</p>
        </div>
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => onShowForm(false)}>
          Fechar
        </button>
      </div>

      {reintegrar && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          Reintegração sugerida: ≥6 meses sem ocorrências. Considere reiniciar a escala no Feedback Formal.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome do colaborador *">
          <input className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </Field>
        <Field label="Matrícula">
          <input className="input-field" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        </Field>
        <Field label="CPF">
          <input className="input-field" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </Field>
        <Field label="Cargo">
          <input className="input-field" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        </Field>
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
        <p className="text-xs font-semibold text-gray-600 mb-2">
          Nível da medida · sugerido automaticamente: <span className="text-[#0f234b]">{nivelPorIdx(sugerido).label}</span>
          {hist.length > 0 ? ` · histórico: ${hist.length} registro(s)` : ' · sem histórico'}
        </p>
        <select
          className="input-field bg-white"
          value={nivelIdx}
          onChange={(e) => {
            setNivelManual(true);
            setNivelIdx(Number(e.target.value));
          }}
        >
          {ESCALA_PEDAGOGICA.map((n) => (
            <option key={n.idx} value={n.idx}>
              {n.idx + 1}. {n.label}
              {n.critico ? ' · CRÍTICO' : ''}
            </option>
          ))}
        </select>
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
        {escalaCritica(nivelIdx) && (
          <p className="mt-2 text-xs font-semibold text-red-700">
            Estágio crítico: considere relatório para Jurídico/DP ou desligamento.
          </p>
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

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={() => onShowForm(false)}>
          Cancelar
        </button>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
      </div>
    </div>
  );
}

function DetailModal({
  item,
  hist,
  isRh,
  onClose,
  onAprovar,
  onRecusar,
  onPdf,
}: {
  item: Advertencia;
  hist: Advertencia[];
  isRh: boolean;
  onClose: () => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onPdf: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Detalhe da advertência</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p>
            <span className="text-gray-500">Colaborador:</span> <strong>{item.colaborador_nome}</strong>
          </p>
          <p>
            <span className="text-gray-500">Nível:</span> {item.nivel_label}{' '}
            <span className={`badge ${STATUS_CLS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
          </p>
          <p>
            <span className="text-gray-500">Motivo:</span> {item.motivo_categoria} — {item.motivo_texto}
          </p>
          <p className="text-gray-700 whitespace-pre-wrap">{item.descricao}</p>
          {item.observacoes_supervisor && (
            <p className="text-xs text-gray-500">Obs. supervisor: {item.observacoes_supervisor}</p>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Histórico do colaborador ({hist.length})</p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {hist.map((h) => (
                <li key={h.id} className="text-xs text-gray-600 border-b border-gray-50 py-1">
                  {fmtDate(h.data_ocorrido)} · {h.nivel_label} · {STATUS_LABEL[h.status]}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary text-xs" onClick={onPdf}>
            Emitir PDF
          </button>
          {isRh && item.status === 'pendente' && (
            <>
              <button type="button" className="btn-secondary text-xs text-red-700" onClick={onRecusar}>
                Recusar
              </button>
              <button type="button" className="btn-primary text-xs" onClick={onAprovar}>
                <CheckCircle2 size={12} className="inline mr-1" /> Aprovar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  warn,
  critical,
  icon: Icon,
}: {
  label: string;
  value: number;
  warn?: boolean;
  critical?: boolean;
  icon: typeof AlertTriangle;
}) {
  return (
    <div
      className={`card p-4 shadow-sm ${
        critical ? 'border-red-400 bg-red-50' : warn ? 'border-amber-300 bg-amber-50' : ''
      }`}
    >
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
        <Icon size={12} /> {label}
        {warn && value > 0 ? (
          <span className="ml-auto badge bg-red-600 text-white">{value}</span>
        ) : null}
      </p>
      <p className={`text-2xl font-black tabular-nums ${critical || warn ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function SegBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
        active ? 'bg-[#0f234b] text-white shadow' : 'text-gray-600 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-gray-500">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

export default AdvertenciasPage;
