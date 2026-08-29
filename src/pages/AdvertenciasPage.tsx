import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, FileText, FileWarning, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { AdvertenciaDetailModal } from '../components/advertencias/AdvertenciaDetailModal';
import { CriacaoPanel } from '../components/advertencias/CriacaoPanel';
import { RecusaAjusteDpModal, type RecusaDpResult } from '../components/advertencias/RecusaAjusteDpModal';
import { fmtDate } from '../components/advertencias/format';
import { AlertDialog, ChipBar, KpiCard, PageAlert, TabBar } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { escalaCritica, nivelPorIdx, requerAprovacaoDp, type Advertencia } from '../lib/advertenciasEscala';
import { gestorDaAdvertencia } from '../lib/advertenciasGestor';
import {
  ADVERTENCIAS_MAIN_TABS,
  CONTROLE_DP_PATH,
  contarDpInbox,
  DP_INBOX_HINT,
  DP_INBOX_LABEL,
  inboxFiltroForRow,
  isEnviadaDp,
  matchDpInbox,
  parseDpInboxParam,
  type DpInboxFiltro,
} from '../lib/advertenciasDpInbox';
import { opcoesFiltroNivel } from '../lib/escalaMedidaUi';
import {
  ADVERTENCIAS_PAGE_LIMIT,
  STATUS_CLS,
  STATUS_LABEL,
  advertenciasStorageMode,
  clearLegacyLocalAdvertencias,
  getAdvertenciaById,
  historicoColaborador,
  kpisAdvertencias,
  listAdvertenciasByStatusAll,
  listAdvertenciasPage,
  mergeAdvertenciaPages,
  notificarSolicitanteAdvertencia,
  blobToBase64,
  sortAdvertenciasDesc,
  updateAdvertenciaStatus,
  upsertAdvertenciaRow,
} from '../lib/advertenciasService';
import { ENTREGA_CLS, ENTREGA_LABEL, podeEmitirPdfOficial, type EntregaModo } from '../lib/advertenciasEntrega';
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

type SubTab = 'criacao' | 'acompanhamento';
export type AdvertenciasWorkspaceMode = 'gestao' | 'dp';

/** Workspace compartilhado: gestão (supervisor) vs ambiente DP (ações). */
export function AdvertenciasWorkspace({ mode }: { mode: AdvertenciasWorkspaceMode }) {
  const { userRole, userName, userEmail } = useAuthStore();
  const isRh = userRole === 'admin';
  const allowDpActions = mode === 'dp';
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<SubTab>(() =>
    searchParams.get('tab') === 'criacao' ? 'criacao' : 'acompanhamento',
  );
  const [rows, setRows] = useState<Advertencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [erro, setErro] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [detail, setDetail] = useState<Advertencia | null>(null);
  const [recusaId, setRecusaId] = useState<string | null>(null);
  const [recusaBusy, setRecusaBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showForm, setShowForm] = useState(false);
  const [storageMode, setStorageMode] = useState<'api' | 'offline'>('api');

  // filtros acompanhamento / inbox DP
  const [fInbox, setFInbox] = useState<DpInboxFiltro>(() => parseDpInboxParam(searchParams.get('inbox')));
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
  /** Gerações de listagem — invalida reload/loadMore concorrentes (Strict Mode / Atualizar). */
  const listGenRef = useRef(0);
  const deepLinkResolvedRef = useRef<string | null>(null);

  const applyLocalRow = useCallback((row: Advertencia) => {
    setRows((prev) => upsertAdvertenciaRow(prev, row));
    setDetail((d) => (d?.id === row.id ? row : d));
  }, []);

  const reload = useCallback(async () => {
    const gen = ++listGenRef.current;
    setLoading(true);
    setLoadingMore(false);
    setErro('');
    setNextCursor(null);
    setHasMore(false);
    try {
      // Página recente + todas pendentes (badge Enviadas confiável sem carregar o histórico inteiro)
      const [page, pendentes] = await Promise.all([
        listAdvertenciasPage({ limit: ADVERTENCIAS_PAGE_LIMIT }),
        listAdvertenciasByStatusAll('pendente'),
      ]);
      if (gen !== listGenRef.current) return;
      setRows(sortAdvertenciasDesc(mergeAdvertenciaPages(page.rows, pendentes)));
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
      setStorageMode(advertenciasStorageMode());
    } catch (e: unknown) {
      if (gen !== listGenRef.current) return;
      setStorageMode('offline');
      setRows([]);
      setNextCursor(null);
      setHasMore(false);
      setErro(e instanceof Error ? e.message : 'Falha ao carregar advertências');
    } finally {
      if (gen === listGenRef.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore || loading) return;
    const gen = listGenRef.current;
    const cursor = nextCursor;
    setLoadingMore(true);
    setErro('');
    try {
      const data = await listAdvertenciasPage({
        cursor,
        limit: ADVERTENCIAS_PAGE_LIMIT,
      });
      if (gen !== listGenRef.current) return;
      setRows((prev) => mergeAdvertenciaPages(prev, data.rows));
      setNextCursor(data.next_cursor);
      setHasMore(data.has_more);
      setStorageMode(advertenciasStorageMode());
    } catch (e: unknown) {
      if (gen !== listGenRef.current) return;
      // Para deep-link / retries: não repetir o mesmo cursor em loop
      setHasMore(false);
      setErro(e instanceof Error ? e.message : 'Falha ao carregar mais advertências');
    } finally {
      if (gen === listGenRef.current) setLoadingMore(false);
    }
  }, [hasMore, nextCursor, loadingMore, loading]);

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
  const inboxCounts = useMemo(() => contarDpInbox(rows), [rows]);

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      if (!matchDpInbox(r, fInbox)) return false;
      if (fMinhas && !isMinhaSolicitacao(r, userEmail)) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fCriticos && !escalaCritica(r.nivel_idx)) return false;
      if (!fCriticos && fNivel !== '' && String(r.nivel_idx) !== fNivel) return false;
      if (fColab) {
        const q = fColab.toLowerCase();
        const blob = `${r.colaborador_nome} ${r.colaborador_matricula || ''} ${gestorDaAdvertencia(r)} ${r.criado_por_nome || ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (fDe && r.data_ocorrido < fDe) return false;
      if (fAte && r.data_ocorrido > fAte) return false;
      return true;
    });
  }, [rows, fInbox, fMinhas, fStatus, fColab, fNivel, fCriticos, fDe, fAte, userEmail]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const pageRows = filtradas.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [fInbox, fMinhas, fStatus, fColab, fNivel, fCriticos, fDe, fAte, pageSize]);

  // Sync inbox from URL (ex.: link compartilhado)
  useEffect(() => {
    const fromUrl = parseDpInboxParam(searchParams.get('inbox'));
    setFInbox((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const podeSelecionarBulk = allowDpActions && fInbox === 'enviadas';
  const pageSelectable = podeSelecionarBulk ? pageRows.filter(isEnviadaDp) : [];
  const selectedOnPage = pageSelectable.filter((r) => selectedIds.has(r.id));
  const allPageSelected = pageSelectable.length > 0 && selectedOnPage.length === pageSelectable.length;
  const selectedCount = selectedIds.size;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const r of pageSelectable) next.delete(r.id);
      } else {
        for (const r of pageSelectable) next.add(r.id);
      }
      return next;
    });
  };

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

  const setDetailIdParam = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('id', id);
          else next.delete('id');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setInboxParam = useCallback(
    (inbox: DpInboxFiltro) => {
      setFInbox(inbox);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (inbox === 'todas') next.delete('inbox');
          else next.set('inbox', inbox);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const fecharDetalhe = useCallback(() => {
    setDetail(null);
    setDetailIdParam(null);
  }, [setDetailIdParam]);

  const abrirDetalhe = useCallback(
    (r: Advertencia) => {
      setDetail(r);
      setTab('acompanhamento');
      setDetailIdParam(r.id);
      if (isMinhaSolicitacao(r, userEmail)) {
        setSeenMap(marcarComoVista(userEmail, r));
      }
    },
    [setDetailIdParam, userEmail],
  );

  const deepLinkId = searchParams.get('id');
  const deepLinkInboxParam = searchParams.get('inbox');

  // Deep link: /advertencias?id=<uuid> — lookup pontual (sem auto-paginar)
  useEffect(() => {
    const id = deepLinkId;
    if (!id || loading) return;
    if (deepLinkResolvedRef.current === id) return;

    const found = rows.find((r) => r.id === id);
    if (found) {
      deepLinkResolvedRef.current = id;
      setDetail(found);
      const fila = inboxFiltroForRow(found);
      const urlInbox = parseDpInboxParam(deepLinkInboxParam);
      if (urlInbox !== fila) {
        setFInbox(fila);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('id', found.id);
            if (fila === 'todas') next.delete('inbox');
            else next.set('inbox', fila);
            return next;
          },
          { replace: true },
        );
      } else {
        setFInbox((prev) => (prev === fila ? prev : fila));
      }
      if (isMinhaSolicitacao(found, userEmail)) {
        setSeenMap(marcarComoVista(userEmail, found));
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const row = await getAdvertenciaById(id);
        if (cancelled) return;
        if (!row) {
          deepLinkResolvedRef.current = id;
          setErro((prev) => prev || 'Advertência do link não encontrada ou sem permissão.');
          setDetailIdParam(null);
          return;
        }
        deepLinkResolvedRef.current = id;
        applyLocalRow(row);
        setDetail(row);
        const fila = inboxFiltroForRow(row);
        setFInbox(fila);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('id', row.id);
            if (fila === 'todas') next.delete('inbox');
            else next.set('inbox', fila);
            return next;
          },
          { replace: true },
        );
        if (isMinhaSolicitacao(row, userEmail)) {
          setSeenMap(marcarComoVista(userEmail, row));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        deepLinkResolvedRef.current = id;
        setErro(e instanceof Error ? e.message : 'Falha ao abrir advertência do link');
        setDetailIdParam(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    deepLinkId,
    deepLinkInboxParam,
    rows,
    loading,
    userEmail,
    applyLocalRow,
    setDetailIdParam,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!deepLinkId) deepLinkResolvedRef.current = null;
  }, [deepLinkId]);

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
      fecharDetalhe();
      setInboxParam('autorizadas');
      applyLocalRow(updated);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao aprovar');
    }
  };

  const bulkAprovarSelecionadas = async () => {
    const ids = [...selectedIds].filter((id) => {
      const r = rows.find((x) => x.id === id);
      return r && isEnviadaDp(r);
    });
    if (!ids.length) {
      setBulkConfirm(false);
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    const agora = new Date().toISOString();
    try {
      for (const id of ids) {
        try {
          const row = rows.find((r) => r.id === id);
          const updated = await updateAdvertenciaStatus(id, {
            status: 'aprovada',
            aprovado_por_email: userEmail,
            aprovado_por_nome: userName,
            aprovado_em: agora,
            entrega_status: 'aguardando_impressao',
            notificacao_status: 'pendente',
          });
          if (!updated) {
            fail += 1;
            continue;
          }
          ok += 1;
          applyLocalRow(updated);
          if (row?.criado_por_email) {
            await msgNotificacao(updated, 'aprovada');
          }
        } catch {
          fail += 1;
        }
      }
      setSelectedIds(new Set());
      setBulkConfirm(false);
      setErro(fail ? `${fail} falha(s) na aprovação em lote.` : '');
      setOkMsg(`${ok} advertência(s) autorizada(s) em lote.${fail ? ` ${fail} não concluída(s).` : ''}`);
      setInboxParam('autorizadas');
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmarRecusa = async (id: string, result: RecusaDpResult) => {
    if (recusaBusy) return;
    setRecusaBusy(true);
    try {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        setErro('Registro não encontrado.');
        return;
      }
      const nivel = nivelPorIdx(result.nivelIdx);
      const mudou = result.nivelIdx !== row.nivel_idx;
      const motivoBase = result.motivo.trim();
      const motivoComMedida = mudou
        ? `Medida ajustada pelo DP: ${nivel.label}${nivel.diasSuspensao ? ` (${nivel.diasSuspensao} dia(s))` : ''}. ${motivoBase}`
        : motivoBase;

      if (result.acao === 'autorizar') {
        const patch: Partial<Advertencia> = {
          status: 'aprovada',
          nivel_idx: nivel.idx,
          nivel_codigo: nivel.codigo,
          nivel_label: nivel.label,
          dias_suspensao: nivel.diasSuspensao,
          entrega_status: 'aguardando_impressao',
          notificacao_status: 'pendente',
          aprovado_por_email: userEmail,
          aprovado_por_nome: userName,
          aprovado_em: new Date().toISOString(),
        };
        if (mudou || motivoBase) {
          const prev = (row.observacoes_supervisor || '').trim();
          patch.observacoes_supervisor = [prev, `Decisão DP: ${motivoComMedida}`].filter(Boolean).join('\n');
        }
        const updated = await updateAdvertenciaStatus(id, patch);
        if (!updated) {
          setErro('Não foi possível autorizar com o ajuste. Tente novamente.');
          return;
        }
        const extra = row.criado_por_email ? await msgNotificacao(updated, 'aprovada') : '';
        setOkMsg(
          mudou
            ? `Medida ajustada para ${nivel.label} e autorizada.${extra}`
            : `Advertência autorizada.${extra}`,
        );
        setErro('');
        setRecusaId(null);
        fecharDetalhe();
        setInboxParam('autorizadas');
        applyLocalRow(updated);
        return;
      }

      const updated = await updateAdvertenciaStatus(id, {
        status: 'recusada',
        recusa_motivo: motivoComMedida || motivoBase,
        nivel_idx: nivel.idx,
        nivel_codigo: nivel.codigo,
        nivel_label: nivel.label,
        dias_suspensao: nivel.diasSuspensao,
        aprovado_por_email: userEmail,
        aprovado_por_nome: userName,
        aprovado_em: new Date().toISOString(),
        notificacao_status: 'pendente',
      });
      if (!updated) {
        setErro('Não foi possível recusar. Tente novamente.');
        return;
      }
      const extra = row.criado_por_email ? await msgNotificacao(updated, 'recusada') : '';
      setOkMsg(
        mudou
          ? `Devolvida com medida sugerida: ${nivel.label}.${extra}`
          : `Advertência recusada / devolvida.${extra}`,
      );
      setErro('');
      setRecusaId(null);
      fecharDetalhe();
      setInboxParam('recusadas');
      applyLocalRow(updated);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao recusar');
    } finally {
      setRecusaBusy(false);
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
      applyLocalRow(updated);
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
      setInboxParam('recebidas');
      if (isMinhaSolicitacao(updated, userEmail)) {
        setSeenMap(marcarComoVista(userEmail, updated));
      }
      applyLocalRow(updated);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao confirmar entrega');
    }
  };

  const emitirPdf = async (a: Advertencia) => {
    const ambiente = mode === 'dp' ? 'dp' : 'gestao';
    if (!podeEmitirPdfOficial(a, { ambiente })) {
      setErro(
        ambiente === 'gestao'
          ? 'Suspensão/apuração: PDF oficial só no Controle DP após aprovação.'
          : 'PDF oficial só após aprovação do DP (ou auto-aprovação da medida).',
      );
      return;
    }
    try {
      const blob = await gerarPdfAdvertencia(a);
      downloadPdfBlob(blob, `advertencia_${(a.colaborador_matricula || a.colaborador_nome).replace(/\s+/g, '_')}.pdf`);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar PDF');
    }
  };

  const exportarExcel = () => {
    if (!filtradas.length) return;
    if (hasMore) {
      const ok = window.confirm(
        `Há mais registros no servidor além dos ${rows.length} já carregados.\n\nExportar só o que está na tela (filtros atuais)?`,
      );
      if (!ok) return;
    }
    exportAdvertenciasExcel(filtradas);
    setExportOk(true);
    setOkMsg(
      hasMore
        ? `Excel parcial: ${filtradas.length} registro(s) carregado(s)/filtrados.`
        : `Excel gerado com ${filtradas.length} registro(s) (filtros aplicados).`,
    );
    setErro('');
    window.setTimeout(() => setExportOk(false), 2500);
  };

  return (
    <AdminLayout
      title={mode === 'dp' ? 'Controle DP' : 'Gestão de Advertências'}
      subtitle={
        mode === 'dp'
          ? 'Aprovar · recusar · confirmar recebimento · protocolo'
          : 'Criação · Acompanhamento · histórico (somente visualização)'
      }
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
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setTab('acompanhamento');
            setInboxParam('enviadas');
            setFStatus('');
            setFMinhas(false);
          }}
        >
          <KpiCard
            label="Enviadas p/ DP"
            value={inboxCounts.enviadas}
            warn={inboxCounts.enviadas > 0}
            icon={AlertTriangle}
          />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setTab('acompanhamento');
            setInboxParam('autorizadas');
          }}
        >
          <KpiCard label="Autorizadas (em entrega)" value={inboxCounts.autorizadas} icon={FileText} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setTab('acompanhamento');
            setInboxParam('recusadas');
          }}
        >
          <KpiCard label="Recusadas pelo DP" value={inboxCounts.recusadas} icon={ShieldAlert} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => {
            setTab('acompanhamento');
            setInboxParam('recebidas');
          }}
        >
          <KpiCard
            label="Recebidas / protocoladas"
            value={inboxCounts.recebidas}
            icon={FileWarning}
          />
        </button>
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
                setTab('acompanhamento');
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
              setTab('acompanhamento');
              setFNivel('');
              setFCriticos(true);
              setInboxParam('todas');
            }}
          >
            Ver críticos
          </button>
        </div>
      )}

      {mode === 'gestao' ? (
        <div className="card p-3 shadow-sm mb-4 space-y-3">
          <TabBar
            ariaLabel="Seções de advertências"
            className="w-full [&_.tab-bar-item]:flex-1"
            tabs={ADVERTENCIAS_MAIN_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.id === 'criacao' ? Plus : FileText,
              badge: t.id === 'acompanhamento' ? inboxCounts.enviadas : undefined,
            }))}
            active={tab}
            onChange={(id) => {
              const next = id as SubTab;
              setTab(next);
              setSearchParams(
                (prev) => {
                  const sp = new URLSearchParams(prev);
                  if (next === 'acompanhamento') sp.delete('tab');
                  else sp.set('tab', next);
                  return sp;
                },
                { replace: true },
              );
            }}
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
            <Link to={`${CONTROLE_DP_PATH}?inbox=enviadas`} className="btn-secondary text-sm py-2 px-3 inline-flex items-center">
              Ir para Controle DP
            </Link>
          </div>
        </div>
      ) : (
        <div className="card p-3 shadow-sm mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm py-2 px-3" onClick={() => void reload()}>
            <RefreshCw size={14} className="inline mr-1" /> Atualizar
          </button>
          <Link to="/advertencias?tab=criacao" className="btn-secondary text-sm py-2 px-3 inline-flex items-center">
            Nova advertência (gestão)
          </Link>
        </div>
      )}

      {mode === 'gestao' && tab === 'criacao' && (
        <div role="tabpanel" id="panel-criacao" aria-labelledby="tab-criacao">
        <CriacaoPanel
          rows={rows}
          listIncomplete={hasMore}
          isRh={isRh}
          userName={userName}
          userEmail={userEmail}
          showForm={showForm}
          onShowForm={setShowForm}
          onCreated={async (created, precisaAprovacao) => {
            setShowForm(false);
            setErro('');
            applyLocalRow(created);
            if (precisaAprovacao) {
              setOkMsg('Suspensão/apuração enviada. Acompanhe aqui; o DP responde em Controle DP.');
              setTab('acompanhamento');
              setInboxParam('enviadas');
            } else {
              setOkMsg('Documento gerado — acompanhe entrega no Controle DP quando aplicável.');
              try {
                await emitirPdf(created);
              } catch {
                /* PDF opcional se falhar */
              }
              setTab('acompanhamento');
              setInboxParam('autorizadas');
            }
          }}
          onError={setErro}
        />
        </div>
      )}

      {(mode === 'dp' || tab === 'acompanhamento') && (
        <div
          role="tabpanel"
          id={mode === 'dp' ? 'panel-controle-dp' : 'panel-acompanhamento'}
          aria-labelledby={mode === 'dp' ? 'tab-controle-dp' : 'tab-acompanhamento'}
        >
        <div className="card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0f234b]">
                  {allowDpActions
                    ? 'Controle DP · Aprovar, recusar e confirmar entrega'
                    : 'Acompanhamento · Histórico e andamento (somente visualização)'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {allowDpActions
                    ? `Ambiente do DP · ${DP_INBOX_HINT[fInbox]}`
                    : `Filas de acompanhamento · ${DP_INBOX_HINT[fInbox]}`}
                </p>
              </div>
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
            <ChipBar
              ariaLabel={allowDpActions ? 'Filas do Controle DP' : 'Filas de acompanhamento'}
              variant="brand"
              active={fInbox}
              onChange={(id) => setInboxParam(id as DpInboxFiltro)}
              chips={(Object.keys(DP_INBOX_LABEL) as DpInboxFiltro[]).map((id) => ({
                id,
                label: DP_INBOX_LABEL[id],
                badge: id === 'todas' ? undefined : inboxCounts[id],
              }))}
            />
            <p className="text-xs text-gray-500">
              {filtradas.length} registro(s) nesta fila
              {hasMore ? ` · ${rows.length} carregado(s)` : ''}
              {kpis.noMes > 0 ? ` · ${kpis.noMes} no mês · ${kpis.suspensoesAtivas} suspensão(ões) ativa(s)` : ''}
              {kpis.criticos > 0 ? ` · ${kpis.criticos} crítico(s)` : ''}
              {hasMore
                ? ' · KPIs parciais (exceto Enviadas, sincronizadas por status)'
                : ''}
            </p>
            {podeSelecionarBulk && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2">
                <p className="text-xs text-emerald-900 flex-1 min-w-[12rem]">
                  {selectedCount > 0
                    ? `${selectedCount} selecionada(s) para autorização em lote`
                    : 'Selecione casos enviados para aprovar em lote'}
                </p>
                <button
                  type="button"
                  className="btn-secondary text-xs py-1.5 px-2"
                  disabled={!pageSelectable.length}
                  onClick={toggleSelectPage}
                >
                  {allPageSelected ? 'Limpar página' : 'Selecionar página'}
                </button>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5 px-2"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Limpar seleção
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                  disabled={selectedCount === 0 || bulkBusy}
                  onClick={() => setBulkConfirm(true)}
                >
                  <CheckCircle2 size={12} />
                  Aprovar selecionadas ({selectedCount})
                </button>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-1 md:grid-cols-6 gap-2">
            <input
              className="input-field md:col-span-2"
              placeholder="Buscar colaborador / gestor"
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
                  {podeSelecionarBulk && (
                    <th className="text-left px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Selecionar página"
                        checked={allPageSelected}
                        disabled={!pageSelectable.length}
                        onChange={toggleSelectPage}
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Gestor</th>
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
                    <td colSpan={podeSelecionarBulk ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={podeSelecionarBulk ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma advertência neste filtro.
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => {
                  const novaAtualizacao = temAtualizacaoNaoVista(r, userEmail, seenMap, baselineReady);
                  const selecionavel = podeSelecionarBulk && isEnviadaDp(r);
                  return (
                  <tr
                    key={r.id}
                    className={`border-t border-gray-50 ${
                      selectedIds.has(r.id)
                        ? 'bg-emerald-50/70'
                        : escalaCritica(r.nivel_idx)
                          ? 'bg-red-50/40'
                          : novaAtualizacao
                            ? 'bg-amber-50/70'
                            : ''
                    }`}
                  >
                    {podeSelecionarBulk && (
                      <td className="px-3 py-2">
                        {selecionavel ? (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${r.colaborador_nome}`}
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                          />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
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
                    <td className="px-3 py-2 text-gray-600">{gestorDaAdvertencia(r) || '—'}</td>
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
                      {allowDpActions && r.status === 'pendente' && requerAprovacaoDp(r.nivel_idx) && (
                        <>
                          <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => void aprovar(r.id)}>
                            Aprovar
                          </button>
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setRecusaId(r.id)}>
                            Decidir / ajustar
                          </button>
                        </>
                      )}
                      {podeEmitirPdfOficial(r, { ambiente: mode === 'dp' ? 'dp' : 'gestao' }) ? (
                        <button type="button" className="text-xs text-gray-700 hover:underline" onClick={() => void emitirPdf(r)}>
                          PDF
                        </button>
                      ) : null}
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
              {hasMore ? ` · + no servidor` : ''}
            </span>
            <div className="flex items-center gap-2">
              {hasMore && (
                <button
                  type="button"
                  className="btn-primary py-1 px-3"
                  disabled={loadingMore || loading}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              )}
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
          allowDpActions={allowDpActions}
          userEmail={userEmail}
          onClose={fecharDetalhe}
          onAprovar={() => void aprovar(detail.id)}
          onRecusar={() => setRecusaId(detail.id)}
          onPdf={() => void emitirPdf(detail)}
          pdfAmbiente={mode === 'dp' ? 'dp' : 'gestao'}
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

      {recusaId && (() => {
        const item = rows.find((r) => r.id === recusaId);
        if (!item) return null;
        return (
          <RecusaAjusteDpModal
            item={item}
            busy={recusaBusy}
            onCancel={() => {
              if (recusaBusy) return;
              setRecusaId(null);
            }}
            onConfirm={(result) => {
              void confirmarRecusa(recusaId, result);
            }}
          />
        );
      })()}

      <AlertDialog
        open={bulkConfirm}
        title="Autorizar em lote"
        description={
          <p>
            Confirma a aprovação de <strong>{selectedCount}</strong> advertência(s) enviada(s)?
            Elas seguirão para impressão/entrega <strong>sem reformular a medida</strong> (nível e
            dias permanecem como solicitados). Para ajustar dias ou tipo, use{' '}
            <em>Decidir / ajustar</em> em cada caso.
          </p>
        }
        confirmLabel={bulkBusy ? 'Aprovando…' : `Aprovar ${selectedCount}`}
        cancelLabel="Cancelar"
        onCancel={() => {
          if (bulkBusy) return;
          setBulkConfirm(false);
        }}
        onConfirm={() => {
          if (bulkBusy) return;
          void bulkAprovarSelecionadas();
        }}
      />
    </AdminLayout>
  );
}

export function AdvertenciasPage() {
  return <AdvertenciasWorkspace mode="gestao" />;
}

export default AdvertenciasPage;
