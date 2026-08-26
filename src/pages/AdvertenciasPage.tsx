import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileWarning,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { AdvertenciaPreviewModal } from '../components/AdvertenciaPreviewModal';
import { KpiCard, PageAlert, TabBar } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import {
  ESCALA_PEDAGOGICA,
  MOTIVOS_CATEGORIA,
  escalaCritica,
  nivelPorIdx,
  podeAvancarNivel,
  requerAprovacaoDp,
  sugerirProximoNivel,
  sugerirReintegracao,
  type Advertencia,
} from '../lib/advertenciasEscala';
import { rotuloDocumentoSubmotivo, submotivosDoMotivo } from '../lib/siscadMotivos';
import {
  STATUS_CLS,
  STATUS_LABEL,
  advertenciasStorageMode,
  clearLegacyLocalAdvertencias,
  createAdvertencia,
  historicoColaborador,
  kpisAdvertencias,
  listAdvertencias,
  niveisAplicados,
  notificarSolicitanteAdvertencia,
  blobToBase64,
  updateAdvertenciaStatus,
} from '../lib/advertenciasService';
import {
  ENTREGA_CLS,
  ENTREGA_LABEL,
  ENTREGA_MODO_LABEL,
  podeConfirmarEntrega,
  podeMarcarImpressa,
  type EntregaModo,
} from '../lib/advertenciasEntrega';
import {
  isMinhaSolicitacao,
  marcarComoVista,
  marcarTodasMinhasComoVistas,
  NOTIFICACAO_LABEL,
  resumoMinhasSolicitacoes,
  seedBaseline,
  temAtualizacaoNaoVista,
  type SeenSnapshot,
} from '../lib/advertenciasNotificacao';
import { downloadPdfBlob, gerarPdfAdvertencia } from '../lib/advertenciasPdf';
import { melhorarNarrativaAdvertencia } from '../lib/advertenciasNarrativaIa';
import { buildAdvertenciaDraft, canPreviewAdvertencia } from '../lib/advertenciasDraft';
import { exportAdvertenciasExcel } from '../lib/advertenciasExport';
import { fetchEvaLive } from '../lib/evaDash';
import {
  buildOperadoresCatalog,
  filtrarOperadores,
  type OperadorSugestao,
} from '../lib/operadoresCatalog';

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
  const [storageMode, setStorageMode] = useState<'api' | 'offline'>('api');

  // filtros controle
  const [fStatus, setFStatus] = useState('');
  const [fColab, setFColab] = useState('');
  const [fNivel, setFNivel] = useState('');
  const [fCriticos, setFCriticos] = useState(false);
  const [fDe, setFDe] = useState('');
  const [fAte, setFAte] = useState('');
  const [fMinhas, setFMinhas] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportOk, setExportOk] = useState(false);
  const [seenMap, setSeenMap] = useState<Record<string, SeenSnapshot>>({});
  const [baselineReady, setBaselineReady] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const data = await listAdvertencias();
      setRows(data);
      setStorageMode(advertenciasStorageMode());
    } catch (e: unknown) {
      setStorageMode('offline');
      setErro(e instanceof Error ? e.message : 'Falha ao carregar advertências');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    clearLegacyLocalAdvertencias();
  }, []);

  useEffect(() => {
    if (!userEmail || !rows.length) return;
    const map = seedBaseline(userEmail, rows);
    setSeenMap(map);
    setBaselineReady(true);
  }, [rows, userEmail]);

  const minhasResumo = useMemo(() => resumoMinhasSolicitacoes(rows, userEmail), [rows, userEmail]);

  const atualizacoesNaoVistas = useMemo(() => {
    if (!baselineReady) return [];
    return rows.filter((r) => temAtualizacaoNaoVista(r, userEmail, seenMap, baselineReady));
  }, [rows, userEmail, seenMap, baselineReady]);

  const kpis = useMemo(() => kpisAdvertencias(rows), [rows]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (fMinhas && !isMinhaSolicitacao(r, userEmail)) return false;
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
  }, [rows, fMinhas, fStatus, fColab, fNivel, fCriticos, fDe, fAte, userEmail]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const pageRows = filtradas.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [fMinhas, fStatus, fColab, fNivel, fCriticos, fDe, fAte, pageSize]);

  const msgNotificacao = async (updated: Advertencia, tipo: 'aprovada' | 'recusada') => {
    try {
      let pdfB64: string | undefined;
      if (tipo === 'aprovada') {
        const blob = await gerarPdfAdvertencia(updated);
        pdfB64 = await blobToBase64(blob);
      }
      const res = await notificarSolicitanteAdvertencia(updated.id, pdfB64);
      if (res.skipped) {
        return ' E-mail aguardando configuração no Pages (estrutura pronta).';
      }
      if (res.ok) return ' Solicitante notificado por e-mail.';
      return res.error ? ` Falha no e-mail: ${res.error}` : '';
    } catch (e: unknown) {
      return ` Falha ao notificar: ${e instanceof Error ? e.message : 'erro'}`;
    }
  };

  const aprovar = async (id: string) => {
    try {
      const row = rows.find((r) => r.id === id);
      const updated = await updateAdvertenciaStatus(id, {
        status: 'aprovada',
        aprovado_por_email: userEmail,
        aprovado_por_nome: userName,
        aprovado_em: new Date().toISOString(),
        entrega_status: 'aguardando_impressao',
        notificacao_status: 'pendente',
      });
      if (!updated) {
        setErro('Não foi possível aprovar. Tente novamente.');
        return;
      }
      const extra = row?.criado_por_email ? await msgNotificacao(updated, 'aprovada') : '';
      setOkMsg(`Advertência aprovada.${extra}`);
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
      const row = rows.find((r) => r.id === id);
      const updated = await updateAdvertenciaStatus(id, {
        status: 'recusada',
        recusa_motivo: motivo,
        aprovado_por_email: userEmail,
        aprovado_por_nome: userName,
        aprovado_em: new Date().toISOString(),
        notificacao_status: 'pendente',
      });
      if (!updated) {
        setErro('Não foi possível recusar. Tente novamente.');
        return;
      }
      const extra = row?.criado_por_email ? await msgNotificacao(updated, 'recusada') : '';
      setOkMsg(`Advertência recusada / devolvida.${extra}`);
      setErro('');
      setDetail(null);
      await reload();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao recusar');
    }
  };

  const marcarImpressa = async (a: Advertencia) => {
    try {
      const updated = await updateAdvertenciaStatus(a.id, {
        entrega_status: 'impressa',
        impressa_em: new Date().toISOString(),
        impressa_por_nome: userName,
        impressa_por_email: userEmail,
      });
      if (!updated) {
        setErro('Não foi possível registrar impressão.');
        return;
      }
      setOkMsg('Documento marcado como impresso. Confirme a entrega após protocolo.');
      setDetail(updated);
      await reload();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao registrar impressão');
    }
  };

  const confirmarEntrega = async (a: Advertencia, modo: EntregaModo, obs: string) => {
    try {
      const entregaStatus = modo === 'recusa_ciencia_testemunhas' ? 'recusada_ciencia' : 'entregue';
      const updated = await updateAdvertenciaStatus(a.id, {
        entrega_status: entregaStatus,
        entrega_modo: modo,
        entrega_observacao: obs.trim() || null,
        entregue_em: new Date().toISOString(),
        entregue_por_nome: userName,
        entregue_por_email: userEmail,
        ciencia_colaborador: modo !== 'recusa_ciencia_testemunhas',
      });
      if (!updated) {
        setErro('Não foi possível confirmar entrega.');
        return;
      }
      setOkMsg('Entrega/protocolo registrado com sucesso.');
      setDetail(updated);
      if (isMinhaSolicitacao(updated, userEmail)) {
        setSeenMap(marcarComoVista(userEmail, updated));
      }
      await reload();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao confirmar entrega');
    }
  };

  const abrirDetalhe = (r: Advertencia) => {
    setDetail(r);
    if (isMinhaSolicitacao(r, userEmail)) {
      setSeenMap(marcarComoVista(userEmail, r));
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

  const exportarExcel = () => {
    if (!filtradas.length) return;
    exportAdvertenciasExcel(filtradas);
    setExportOk(true);
    setOkMsg(`Excel gerado com ${filtradas.length} registro(s) (filtros aplicados).`);
    setErro('');
    window.setTimeout(() => setExportOk(false), 2500);
  };

  return (
    <AdminLayout
      title="Gestão de Advertências"
      subtitle="Escala pedagógica · Motivos Siscad · Acesso temporário: somente Admin"
    >
      {(erro || okMsg) && (
        <PageAlert variant={erro ? 'error' : 'success'} onDismiss={() => { setErro(''); setOkMsg(''); }}>
          {erro || okMsg}
        </PageAlert>
      )}

      {storageMode === 'offline' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          API de advertências indisponível. Confirme migration <code>013_session_harden.sql</code>, faça
          logout/login e verifique secrets do Pages (sem secret no browser).
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <KpiCard label="Suspensões p/ aprovação DP" value={kpis.pendentes} warn={kpis.pendentes > 0} icon={AlertTriangle} />
        <KpiCard label="Advertências no mês" value={kpis.noMes} icon={FileText} />
        <KpiCard label="Suspensões ativas" value={kpis.suspensoesAtivas} icon={ShieldAlert} />
        <KpiCard label="Escala máxima (crítico)" value={kpis.criticos} warn={kpis.criticos > 0} critical={kpis.criticos > 0} icon={FileWarning} />
      </div>

      {minhasResumo.total > 0 && (
        <div className="mb-4 rounded-xl border border-[#0f234b]/15 bg-[#0f234b]/[0.03] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-700">
            <p className="font-semibold text-[#0f234b]">Minhas solicitações</p>
            <p className="text-gray-500 mt-0.5">
              {minhasResumo.pendentesDp} aguardando DP · {minhasResumo.aguardandoEntrega} aguardando entrega
              {atualizacoesNaoVistas.length > 0 ? (
                <span className="ml-1 text-amber-700 font-medium">
                  · {atualizacoesNaoVistas.length} atualização(ões) nova(s)
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {atualizacoesNaoVistas.length > 0 && (
              <button
                type="button"
                className="btn-secondary text-xs py-1.5 px-3"
                onClick={() => {
                  setSeenMap(marcarTodasMinhasComoVistas(userEmail, rows));
                  setOkMsg('Atualizações marcadas como vistas.');
                }}
              >
                Marcar todas como vistas
              </button>
            )}
            <button
              type="button"
              className={`btn-secondary text-xs py-1.5 px-3 ${fMinhas ? 'ring-2 ring-[#0f234b]/30' : ''}`}
              onClick={() => {
                setTab('controle');
                setFMinhas(true);
              }}
            >
              Ver minhas ({minhasResumo.total})
            </button>
          </div>
        </div>
      )}

      {atualizacoesNaoVistas.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Há solicitações suas com status atualizado</p>
          <ul className="mt-1 text-xs space-y-0.5">
            {atualizacoesNaoVistas.slice(0, 5).map((r) => (
              <li key={r.id}>
                <button type="button" className="underline hover:no-underline" onClick={() => abrirDetalhe(r)}>
                  {r.colaborador_nome} — {STATUS_LABEL[r.status]}
                  {r.entrega_status ? ` · ${ENTREGA_LABEL[r.entrega_status]}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      <div className="card p-3 shadow-sm mb-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <TabBar
          ariaLabel="Seções de advertências"
          tabs={[
            { id: 'criacao', label: 'Criação', icon: Plus },
            { id: 'controle', label: 'Controle (RH)', icon: FileText, badge: kpis.pendentes },
          ]}
          active={tab}
          onChange={(id) => setTab(id as SubTab)}
          size="sm"
        />
        <div className="flex flex-wrap gap-2">
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
        <div role="tabpanel" id="panel-criacao" aria-labelledby="tab-criacao">
        <CriacaoPanel
          rows={rows}
          isRh={isRh}
          userName={userName}
          userEmail={userEmail}
          showForm={showForm}
          onShowForm={setShowForm}
          onCreated={async (created, precisaAprovacao) => {
            setShowForm(false);
            setErro('');
            if (precisaAprovacao) {
              setOkMsg('Suspensão enviada para aprovação do DP.');
              setTab('controle');
            } else {
              setOkMsg('Documento gerado — pronto para impressão (sem aprovação do DP).');
              try {
                await emitirPdf(created);
              } catch {
                /* PDF opcional se falhar */
              }
              setTab('controle');
            }
            await reload();
          }}
          onError={setErro}
        />
        </div>
      )}

      {tab === 'controle' && (
        <div role="tabpanel" id="panel-controle" aria-labelledby="tab-controle">
        <div className="card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {filtradas.length} registro(s) no filtro atual
            </p>
            <button
              type="button"
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              disabled={!filtradas.length || loading}
              onClick={exportarExcel}
            >
              <Download size={14} />
              {exportOk ? 'Excel gerado!' : 'Exportar Excel'}
            </button>
          </div>
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-1 md:grid-cols-6 gap-2">
            <input
              className="input-field md:col-span-2"
              placeholder="Buscar colaborador / responsável"
              value={fColab}
              onChange={(e) => setFColab(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-gray-600 px-2 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <input type="checkbox" checked={fMinhas} onChange={(e) => setFMinhas(e.target.checked)} />
              Minhas solicitações
            </label>
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

          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Responsável</th>
                  <th className="text-left px-3 py-2">Motivo</th>
                  <th className="text-left px-3 py-2">Nível</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Entrega</th>
                  <th className="text-right px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma advertência neste filtro.
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => {
                  const novaAtualizacao = temAtualizacaoNaoVista(r, userEmail, seenMap, baselineReady);
                  return (
                  <tr
                    key={r.id}
                    className={`border-t border-gray-50 ${
                      escalaCritica(r.nivel_idx) ? 'bg-red-50/40' : novaAtualizacao ? 'bg-amber-50/70' : ''
                    }`}
                  >
                    <td className="px-4 py-2 tabular-nums text-gray-600">
                      {fmtDate(r.data_ocorrido)}
                      {novaAtualizacao ? (
                        <span className="ml-1 badge bg-amber-500 text-white text-[9px]">Nova</span>
                      ) : null}
                    </td>
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
                    <td className="px-3 py-2">
                      {r.entrega_status ? (
                        <span className={`badge text-[10px] ${ENTREGA_CLS[r.entrega_status]}`}>
                          {ENTREGA_LABEL[r.entrega_status]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-right space-x-1">
                      <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => abrirDetalhe(r)}>
                        Ver
                      </button>
                      {isRh && r.status === 'pendente' && requerAprovacaoDp(r.nivel_idx) && (
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
                  );
                })}
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
        </div>
      )}

      {detail && (
        <DetailModal
          item={detail}
          hist={historicoColaborador(rows, detail.colaborador_nome, detail.colaborador_matricula || undefined)}
          isRh={isRh}
          userEmail={userEmail}
          onClose={() => setDetail(null)}
          onAprovar={() => void aprovar(detail.id)}
          onRecusar={() => void recusar(detail.id)}
          onPdf={() => void emitirPdf(detail)}
          onMarcarImpressa={() => void marcarImpressa(detail)}
          onConfirmarEntrega={(modo, obs) => void confirmarEntrega(detail, modo, obs)}
          onReenviarNotificacao={async () => {
            try {
              const blob = await gerarPdfAdvertencia(detail);
              const b64 = await blobToBase64(blob);
              const res = await notificarSolicitanteAdvertencia(detail.id, b64, true);
              setOkMsg(res.ok ? 'Notificação reenviada.' : res.message || 'E-mail pendente de configuração.');
            } catch (e: unknown) {
              setErro(e instanceof Error ? e.message : 'Falha ao reenviar');
            }
          }}
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
          Feedback e advertências geram PDF na hora. <strong>Só suspensão</strong> vai para aprovação do DP.
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
              {n.diasSuspensao > 0 ? ' · DP' : ' · impressão direta'}
              {n.critico ? ' · CRÍTICO' : ''}
            </option>
          ))}
        </select>
        {precisaDp ? (
          <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            Esta medida é suspensão: ficará <strong>pendente de aprovação do DP</strong> antes da impressão oficial.
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
            Feedback/advertência: ao salvar, o <strong>PDF é gerado na hora</strong> (sem fila do DP).
          </p>
        )}
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

function DetailModal({
  item,
  hist,
  isRh,
  userEmail,
  onClose,
  onAprovar,
  onRecusar,
  onPdf,
  onMarcarImpressa,
  onConfirmarEntrega,
  onReenviarNotificacao,
}: {
  item: Advertencia;
  hist: Advertencia[];
  isRh: boolean;
  userEmail: string;
  onClose: () => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onPdf: () => void;
  onMarcarImpressa: () => void;
  onConfirmarEntrega: (modo: EntregaModo, obs: string) => void;
  onReenviarNotificacao: () => void;
}) {
  const [modoEntrega, setModoEntrega] = useState<EntregaModo>('assinatura_colaborador');
  const [obsEntrega, setObsEntrega] = useState('');
  const minha = isMinhaSolicitacao(item, userEmail);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Detalhe da advertência</h3>
            {minha ? (
              <p className="text-[10px] text-[#0f234b] font-medium mt-0.5">Sua solicitação</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p>
            <span className="text-gray-500">Colaborador:</span> <strong>{item.colaborador_nome}</strong>
          </p>
          <p>
            <span className="text-gray-500">Responsável:</span> {item.criado_por_nome || '—'}
            {item.criado_por_email ? <span className="text-gray-400"> ({item.criado_por_email})</span> : null}
          </p>
          <p>
            <span className="text-gray-500">Nível:</span> {item.nivel_label}{' '}
            <span className={`badge ${STATUS_CLS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
            {item.entrega_status ? (
              <span className={`ml-1 badge ${ENTREGA_CLS[item.entrega_status]}`}>
                {ENTREGA_LABEL[item.entrega_status]}
              </span>
            ) : null}
          </p>
          {item.aprovado_por_nome && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {item.status === 'recusada' ? 'Devolvida' : 'Aprovada'} por <strong>{item.aprovado_por_nome}</strong>
              {item.aprovado_em ? ` em ${fmtDateTime(item.aprovado_em)}` : ''}
              {item.recusa_motivo ? (
                <span className="block mt-1 text-red-700">Motivo: {item.recusa_motivo}</span>
              ) : null}
            </p>
          )}
          {item.notificacao_status && item.notificacao_status !== 'desativada' && (
            <p className="text-xs text-gray-600">
              E-mail solicitante: {NOTIFICACAO_LABEL[item.notificacao_status]}
              {item.notificacao_enviada_em ? ` · ${fmtDateTime(item.notificacao_enviada_em)}` : ''}
              {item.notificacao_erro ? (
                <span className="block text-red-600">{item.notificacao_erro}</span>
              ) : null}
            </p>
          )}
          <EntregaTimeline item={item} />
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

          {podeMarcarImpressa(item) && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs space-y-2">
              <p className="font-semibold text-sky-900">Controle de entrega — passo 1</p>
              <p className="text-sky-800">Após gerar o PDF, registre que o documento foi impresso.</p>
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={onPdf}>
                <Printer size={12} /> Baixar PDF
              </button>
              <button type="button" className="btn-primary text-xs ml-2" onClick={onMarcarImpressa}>
                Marcar como impresso
              </button>
            </div>
          )}

          {podeConfirmarEntrega(item) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs space-y-2">
              <p className="font-semibold text-indigo-900">Controle de entrega — passo 2</p>
              <p className="text-indigo-800">Confirme como o documento foi entregue ao colaborador ou protocolado no DP.</p>
              <select
                className="input-field text-xs"
                value={modoEntrega}
                onChange={(e) => setModoEntrega(e.target.value as EntregaModo)}
              >
                {(Object.keys(ENTREGA_MODO_LABEL) as EntregaModo[]).map((k) => (
                  <option key={k} value={k}>
                    {ENTREGA_MODO_LABEL[k]}
                  </option>
                ))}
              </select>
              <textarea
                className="input-field text-xs min-h-[60px]"
                placeholder="Observação / nº protocolo / testemunhas (opcional)"
                value={obsEntrega}
                onChange={(e) => setObsEntrega(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => onConfirmarEntrega(modoEntrega, obsEntrega)}
              >
                Confirmar entrega / protocolo
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary text-xs" onClick={onPdf}>
            Emitir PDF
          </button>
          {isRh && item.criado_por_email && (item.status === 'aprovada' || item.status === 'recusada') && (
            <button type="button" className="btn-secondary text-xs" onClick={() => void onReenviarNotificacao()}>
              Reenviar e-mail
            </button>
          )}
          {isRh && item.status === 'pendente' && requerAprovacaoDp(item.nivel_idx) && (
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

function EntregaTimeline({ item }: { item: Advertencia }) {
  const steps = [
    { ok: true, label: 'Solicitação criada', quando: item.created_at },
    {
      ok: item.status !== 'pendente',
      label: item.status === 'recusada' ? 'Devolvida pelo DP' : 'Aprovada pelo DP',
      quando: item.aprovado_em,
    },
    { ok: item.entrega_status === 'impressa' || item.entrega_status === 'entregue' || item.entrega_status === 'recusada_ciencia', label: 'Documento impresso', quando: item.impressa_em },
    {
      ok: item.entrega_status === 'entregue' || item.entrega_status === 'recusada_ciencia',
      label: item.entrega_status === 'recusada_ciencia' ? 'Recusa de ciência registrada' : 'Entrega confirmada',
      quando: item.entregue_em,
    },
  ];
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-gray-500 mb-2">Trilha de entrega</p>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.label} className={`text-xs flex items-center gap-2 ${s.ok ? 'text-gray-800' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {s.label}
            {s.ok && s.quando ? <span className="text-gray-400">· {fmtDateTime(s.quando)}</span> : null}
          </li>
        ))}
      </ol>
      {item.entrega_observacao ? (
        <p className="text-[10px] text-gray-500 mt-2">Obs. entrega: {item.entrega_observacao}</p>
      ) : null}
    </div>
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

function fmtDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export default AdvertenciasPage;
