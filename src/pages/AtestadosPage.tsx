import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, FileHeart, FilePlus, Loader2, PieChart, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { TabBar } from '../components/ui/TabBar';
import { PageAlert } from '../components/ui/PageAlert';
import { KpiCard } from '../components/ui/KpiCard';
import { ProtocolarPanel } from '../components/atestados/ProtocolarPanel';
import { GerencialPanel } from '../components/atestados/GerencialPanel';
import { AtestadoDetailModal } from '../components/atestados/AtestadoDetailModal';
import { useAuthStore } from '../store/authStore';
import { listAtestadosPage, bulkAtualizarAtestados } from '../lib/atestadosService';
import { AtestadoEmptyState } from '../components/atestados/AtestadoEmptyState';
import { exportAtestadosExcel } from '../lib/atestadosExport';
import { isAtestadoSmbPending, protocoloSuccessMessage } from '../lib/atestadosSmbStatus';
import { brtParts } from '../lib/brt';
import {
  STATUS_CHIP,
  STATUS_LABELS,
  TIPO_LABELS,
  type Atestado,
  type AtestadoStatus,
} from '../lib/atestadosEscala';

type Tab = 'protocolar' | 'acervo' | 'gerencial';

const TABS = [
  { id: 'protocolar' as const, label: 'Protocolar', icon: FilePlus },
  { id: 'acervo' as const, label: 'Acervo', icon: Archive },
  { id: 'gerencial' as const, label: 'Gerencial anual', icon: PieChart },
];

export function AtestadosPage() {
  const { userName, userEmail } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const value = searchParams.get('tab');
    if (searchParams.get('id')) return 'acervo';
    return value === 'acervo' || value === 'gerencial' ? value : 'protocolar';
  });
  const [rows, setRows] = useState<Atestado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<AtestadoStatus | ''>('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [detail, setDetail] = useState<Atestado | null>(null);
  const [anoGerencial, setAnoGerencial] = useState(() => brtParts().y);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadGeneration = useRef(0);
  const deepLinkResolved = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setErro('');
    try {
      const page = await listAtestadosPage({
        cursor,
        limit: 25,
        status: filtroStatus || null,
        colaborador: buscaAplicada.length >= 2 ? buscaAplicada : null,
      });
      if (generation !== loadGeneration.current) return;
      setRows(page.rows);
      setNextCursor(page.next_cursor);
      setHasMore(page.has_more);
    } catch (e: unknown) {
      if (generation !== loadGeneration.current) return;
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [filtroStatus, buscaAplicada, cursor]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBuscaAplicada(busca.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
    setSelected(new Set());
  }, [filtroStatus, buscaAplicada]);

  const setDetailParam = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set('id', id);
            next.set('tab', 'acervo');
          } else {
            next.delete('id');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const abrirDetalhe = useCallback(
    (row: Atestado) => {
      setDetail(row);
      setTab('acervo');
      setDetailParam(row.id);
    },
    [setDetailParam],
  );

  const fecharDetalhe = useCallback(() => {
    setDetail(null);
    setDetailParam(null);
  }, [setDetailParam]);

  const deepLinkId = searchParams.get('id');
  useEffect(() => {
    if (!deepLinkId) {
      deepLinkResolved.current = null;
      return;
    }
    if (deepLinkResolved.current === deepLinkId) return;
    const local = rows.find((row) => row.id === deepLinkId);
    if (local) {
      deepLinkResolved.current = deepLinkId;
      setDetail(local);
      setTab('acervo');
      return;
    }
    let cancelled = false;
    void listAtestadosPage({ id: deepLinkId })
      .then((page) => {
        if (cancelled) return;
        deepLinkResolved.current = deepLinkId;
        const found = page.rows[0];
        if (!found) {
          setErro('Atestado do link não encontrado ou sem permissão.');
          setDetailParam(null);
          return;
        }
        setDetail(found);
        setTab('acervo');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        deepLinkResolved.current = deepLinkId;
        setErro(e instanceof Error ? e.message : 'Falha ao abrir o atestado do link.');
        setDetailParam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deepLinkId, rows, setDetailParam]);

  const kpis = useMemo(() => {
    const pendentes = rows.filter((r) => r.status === 'protocolado' || r.status === 'em_analise').length;
    const aprovados = rows.filter((r) => r.status === 'aprovado' || r.status === 'arquivado').length;
    const recusados = rows.filter((r) => r.status === 'recusado').length;
    return { total: rows.length, pendentes, aprovados, recusados };
  }, [rows]);

  const onCreated = (a: Atestado) => {
    setCursor(null);
    setCursorHistory([]);
    setRows((prev) => [a, ...prev].slice(0, 25));
    setOk(protocoloSuccessMessage(a));
    setTab('acervo');
    setSearchParams({ tab: 'acervo' }, { replace: true });
  };

  const onUpdated = (a: Atestado) => {
    setRows((prev) => prev.map((r) => (r.id === a.id ? a : r)));
    setOk(`Status atualizado: ${STATUS_LABELS[a.status]}`);
  };

  const pendentesIds = useMemo(
    () => rows.filter((r) => r.status === 'protocolado' || r.status === 'em_analise').map((r) => r.id),
    [rows],
  );

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulkAprovar = async () => {
    const ids = [...selected].filter((id) => pendentesIds.includes(id));
    if (!ids.length) {
      setErro('Selecione atestados pendentes para aprovar.');
      return;
    }
    setBulkBusy(true);
    const { ok: okCount, erros } = await bulkAtualizarAtestados(ids, { status: 'aprovado' });
    setBulkBusy(false);
    // Bug fix: okCount é o count de sucesso. erros.length indica quantos falharam.
    // Só marcar como aprovados os primeiros okCount IDs (a função itera em ordem).
    const idsOk = erros.length ? ids.slice(0, okCount) : ids;
    if (idsOk.length) {
      setRows((prev) =>
        prev.map((r) => (idsOk.includes(r.id) ? { ...r, status: 'aprovado' as const } : r)),
      );
      setSelected(new Set());
      setOk(`${idsOk.length} atestado(s) aprovado(s) em lote.`);
    }
    if (erros.length) setErro(erros[0]);
  };

  return (
    <AdminLayout
      title="Atestados"
      subtitle="Protocolo, análise inteligente e visão gerencial anual"
    >
      <div className="space-y-4">
        {erro && (
          <PageAlert variant="error" onDismiss={() => setErro('')}>
            {erro}
          </PageAlert>
        )}
        {ok && (
          <PageAlert variant="success" onDismiss={() => setOk('')}>
            {ok}
          </PageAlert>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Nesta página" value={kpis.total} icon={FileHeart} />
          <KpiCard label="Pendentes na página" value={kpis.pendentes} icon={Loader2} warn={kpis.pendentes > 0} />
          <KpiCard label="Aprovados na página" value={kpis.aprovados} icon={FileHeart} />
          <KpiCard label="Recusados na página" value={kpis.recusados} icon={FileHeart} critical={kpis.recusados > 0} />
        </div>

        <TabBar
          tabs={TABS}
          active={tab}
          onChange={(id) => {
            const next = id as Tab;
            setTab(next);
            setSearchParams((prev) => {
              const params = new URLSearchParams(prev);
              params.set('tab', next);
              if (next !== 'acervo') params.delete('id');
              return params;
            }, { replace: true });
          }}
          ariaLabel="Atestados"
        />

        {tab === 'protocolar' && (
          <ProtocolarPanel
            rows={rows}
            userName={userName || ''}
            userEmail={userEmail || ''}
            onCreated={onCreated}
            onError={setErro}
          />
        )}

        {tab === 'acervo' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <input
                className="input text-sm max-w-xs"
                placeholder="Buscar colaborador…"
                aria-label="Buscar atestados por colaborador"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                className="input text-sm"
                aria-label="Filtrar atestados por status"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as AtestadoStatus | '')}
              >
                <option value="">Todos os status</option>
                {(Object.keys(STATUS_LABELS) as AtestadoStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary text-xs" onClick={() => void carregar()}>
                <RefreshCw size={12} className="inline mr-1" />
                Atualizar
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  exportAtestadosExcel(rows);
                  setOk(`Excel gerado com os ${rows.length} registro(s) desta página.`);
                }}
              >
                Exportar Excel
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={bulkBusy || selected.size === 0}
                onClick={() => void bulkAprovar()}
              >
                Aprovar selecionados ({selected.size})
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Carregando…
              </p>
            ) : rows.length === 0 ? (
              <AtestadoEmptyState
                variant="acervo"
                action={
                  <button type="button" className="btn-primary text-xs mt-2" onClick={() => setTab('protocolar')}>
                    Protocolar primeiro atestado
                  </button>
                }
              />
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="p-3 w-8" />
                      <th className="p-3">Protocolo</th>
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Gestor</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Período</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b hover:bg-gray-50 cursor-pointer focus-within:bg-gray-50"
                          onClick={() => abrirDetalhe(r)}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              aria-label={`Selecionar ${r.protocolo}`}
                            />
                          </td>
                          <td className="p-3 font-mono text-xs">
                            <button
                              type="button"
                              className="text-left text-blue-700 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirDetalhe(r);
                              }}
                              aria-label={`Abrir protocolo ${r.protocolo}`}
                            >
                              {r.protocolo}
                            </button>
                          </td>
                          <td className="p-3">{r.colaborador_nome}</td>
                          <td className="p-3 text-xs text-gray-700">{r.colaborador_supervisor || '—'}</td>
                          <td className="p-3 text-xs">{TIPO_LABELS[r.tipo]}</td>
                          <td className="p-3 text-xs">
                            {r.unidade_periodo === 'horas'
                              ? `${r.quantidade_horas || 0}h`
                              : `${r.quantidade_dias || 0}d`}
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status]}`}
                            >
                              {STATUS_LABELS[r.status]}
                            </span>
                            {isAtestadoSmbPending(r) && (
                              <span className="ml-1 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                nuvem
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-gray-500">
                            {r.data_inicio || r.created_at?.slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && rows.length > 0 && (
              <nav className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500" aria-label="Paginação do acervo">
                <span>
                  Página {cursorHistory.length + 1} · {rows.length} registro(s)
                  {buscaAplicada ? ` · busca: “${buscaAplicada}”` : ''}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={cursorHistory.length === 0}
                    onClick={() => {
                      const previous = cursorHistory[cursorHistory.length - 1] ?? null;
                      setCursorHistory((history) => history.slice(0, -1));
                      setCursor(previous);
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={!hasMore || !nextCursor}
                    onClick={() => {
                      if (!nextCursor) return;
                      setCursorHistory((history) => [...history, cursor]);
                      setCursor(nextCursor);
                    }}
                  >
                    Próxima
                  </button>
                </div>
              </nav>
            )}
          </div>
        )}

        {tab === 'gerencial' && (
          <GerencialPanel rows={rows} ano={anoGerencial} onAnoChange={setAnoGerencial} />
        )}
      </div>

      {detail && (
        <AtestadoDetailModal
          item={detail}
          onClose={fecharDetalhe}
          onUpdated={onUpdated}
          onError={setErro}
        />
      )}
    </AdminLayout>
  );
}

export default AtestadosPage;
