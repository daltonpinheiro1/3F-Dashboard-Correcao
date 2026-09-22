import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import { ProtocolarPanel } from '../components/atestados/ProtocolarPanel';
import { AtestadoDetailModal } from '../components/atestados/AtestadoDetailModal';
import { AtestadoEmptyState } from '../components/atestados/AtestadoEmptyState';
import { useAuthStore } from '../store/authStore';
import { listAtestadosPage } from '../lib/atestadosService';
import {
  STATUS_CHIP,
  STATUS_LABELS,
  TIPO_LABELS,
  type Atestado,
  type AtestadoStatus,
} from '../lib/atestadosEscala';

/** Supervisão envia atestado novo e consulta o próprio acervo, sem editar o que já foi enviado. */
export function AtestadosSolicitarPage() {
  const { userName, userEmail } = useAuthStore();
  const [params] = useSearchParams();
  const initialMatricula = params.get('mat') || params.get('matricula') || '';
  const initialNome = params.get('nome') || '';
  const [rows, setRows] = useState<Atestado[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<AtestadoStatus | ''>('');
  const [detail, setDetail] = useState<Atestado | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadGeneration = useRef(0);

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
      setErro(e instanceof Error ? e.message : 'Falha ao consultar atestados');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [cursor, filtroStatus, buscaAplicada]);

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
  }, [filtroStatus, buscaAplicada]);

  return (
    <AdminLayout
      title="Solicitar atestado"
      subtitle="Envie um atestado novo. A consulta abaixo é só leitura."
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
        <ProtocolarPanel
          rows={rows}
          userName={userName || ''}
          userEmail={userEmail || ''}
          mode="solicitacao"
          initialNome={initialNome}
          initialMatricula={initialMatricula}
          onCreated={(a) => {
            setRows((prev) => [a, ...prev]);
            setOk(`Solicitação ${a.protocolo} enviada ao DP.`);
          }}
          onError={setErro}
        />
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          Consulta do que você já enviou. O filtro não altera status, protocolo nem arquivo.
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input text-sm max-w-xs pl-8"
              placeholder="Buscar colaborador…"
              aria-label="Buscar atestados por colaborador"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
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
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Consultando…
          </p>
        ) : rows.length === 0 ? (
          <AtestadoEmptyState variant="acervo" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="p-3">Protocolo</th>
                  <th className="p-3">Colaborador</th>
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
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setDetail(r)}
                  >
                    <td className="p-3 font-mono text-xs text-blue-700">{r.protocolo}</td>
                    <td className="p-3">{r.colaborador_nome}</td>
                    <td className="p-3 text-xs">{TIPO_LABELS[r.tipo]}</td>
                    <td className="p-3 text-xs">
                      {r.unidade_periodo === 'horas'
                        ? `${r.quantidade_horas || 0}h`
                        : `${r.quantidade_dias || 0}d`}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500">{r.data_inicio || r.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <nav className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500" aria-label="Paginação da consulta">
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

      {detail ? (
        <AtestadoDetailModal
          item={detail}
          allowDpActions={false}
          onClose={() => setDetail(null)}
          onUpdated={() => undefined}
          onError={setErro}
        />
      ) : null}
    </AdminLayout>
  );
}

export default AtestadosSolicitarPage;
