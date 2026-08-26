import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, FileWarning, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { AdvertenciaDetailModal } from '../components/advertencias/AdvertenciaDetailModal';
import { CriacaoPanel } from '../components/advertencias/CriacaoPanel';
import { fmtDate } from '../components/advertencias/format';
import { KpiCard, PageAlert, TabBar } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { ESCALA_PEDAGOGICA, escalaCritica, requerAprovacaoDp, type Advertencia } from '../lib/advertenciasEscala';
import { opcoesFiltroNivel } from '../lib/escalaMedidaUi';
import {
  STATUS_CLS,
  STATUS_LABEL,
  advertenciasStorageMode,
  clearLegacyLocalAdvertencias,
  historicoColaborador,
  kpisAdvertencias,
  listAdvertencias,
  notificarSolicitanteAdvertencia,
  blobToBase64,
  updateAdvertenciaStatus,
} from '../lib/advertenciasService';
import { ENTREGA_CLS, ENTREGA_LABEL, type EntregaModo } from '../lib/advertenciasEntrega';
import {
  isMinhaSolicitacao,
  marcarComoVista,
  marcarTodasMinhasComoVistas,
  resumoMinhasSolicitacoes,
  seedBaseline,
  temAtualizacaoNaoVista,
  type SeenSnapshot,
} from '../lib/advertenciasNotificacao';
import { downloadPdfBlob, gerarPdfAdvertencia } from '../lib/advertenciasPdf';
import { exportAdvertenciasExcel } from '../lib/advertenciasExport';

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
              {Array.from(new Set(opcoesFiltroNivel().map((o) => o.group))).map((group) => (
                <optgroup key={group} label={group || 'Outros'}>
                  {opcoesFiltroNivel()
                    .filter((o) => o.group === group)
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
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
        <AdvertenciaDetailModal
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

export default AdvertenciasPage;
