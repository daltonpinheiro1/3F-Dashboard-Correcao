import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchEvaLive,
  fetchEvaPeriodo,
  type EvaPayload,
} from '../lib/evaDash';
import { useFiltroEvaStore } from '../store/filtroStore';

const LIVE_STALE_MS = 5 * 60_000;

export function liveAgeMs(payload: EvaPayload | null | undefined): number | null {
  const ts = payload?.updated_at || (payload as { meta?: { gerado_em?: string } } | null)?.meta?.gerado_em;
  if (!ts) return null;
  const t = Date.parse(ts.length === 19 ? `${ts}-03:00` : ts);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

export function isLiveStale(payload: EvaPayload | null | undefined, maxMs = LIVE_STALE_MS): boolean {
  const age = liveAgeMs(payload);
  if (age == null) return false;
  return age > maxMs;
}

type Opts = {
  pollMs?: number;
  /** Se false, não faz polling automático. */
  enablePoll?: boolean;
};

/**
 * Carrega live/histórico EVA com AbortController + generation id (anti race).
 */
export function useEvaLive(opts: Opts = {}) {
  const { pollMs = 30_000, enablePoll = true } = opts;
  const tab = useFiltroEvaStore((s) => s.tab);
  const dateFrom = useFiltroEvaStore((s) => s.dateFrom);
  const dateTo = useFiltroEvaStore((s) => s.dateTo);

  const [data, setData] = useState<EvaPayload | null>(null);
  const [hist, setHist] = useState<EvaPayload[]>([]);
  const [histFaltando, setHistFaltando] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());
  const gen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadLive = useCallback(async (spin = true): Promise<boolean> => {
    const my = ++gen.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (spin) setIsLoading(true);
    else setRefreshing(true);
    setFetchError(null);
    try {
      const live = await fetchEvaLive(ac.signal);
      if (my !== gen.current || ac.signal.aborted) return false;
      setData(live);
      setLastUpdate(new Date());
      return true;
    } catch (e) {
      if (ac.signal.aborted || my !== gen.current) return false;
      setFetchError(e instanceof Error ? e.message : 'Falha ao carregar live EVA');
      return false;
    } finally {
      if (my === gen.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadHist = useCallback(async () => {
    const my = ++gen.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setFetchError(null);
    try {
      const { dias, faltando } = await fetchEvaPeriodo(dateFrom, dateTo, ac.signal);
      if (my !== gen.current || ac.signal.aborted) return;
      setHist(dias);
      setHistFaltando(faltando);
      setLastUpdate(new Date());
    } catch (e) {
      if (ac.signal.aborted || my !== gen.current) return;
      setFetchError(e instanceof Error ? e.message : 'Falha ao carregar histórico EVA');
    } finally {
      if (my === gen.current) setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  const reload = useCallback(async () => {
    if (tab === 'live') await loadLive(true);
    else await loadHist();
  }, [tab, loadLive, loadHist]);

  useEffect(() => {
    void reload();
    return () => {
      abortRef.current?.abort();
    };
  }, [reload]);

  useEffect(() => {
    if (!enablePoll || tab !== 'live') return;
    let timer: number | undefined;
    let currentMs = pollMs;
    let failures = 0;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (typeof document !== 'undefined' && document.hidden) {
          schedule();
          return;
        }
        try {
          const ok = await loadLive(false);
          if (ok) {
            failures = 0;
            currentMs = pollMs;
          } else {
            failures += 1;
            currentMs = Math.min(pollMs * Math.pow(2, failures), 120_000);
          }
        } catch {
          failures += 1;
          currentMs = Math.min(pollMs * Math.pow(2, failures), 120_000);
        }
        schedule();
      }, currentMs);
    };

    schedule();
    const onVis = () => {
      if (!document.hidden) {
        failures = 0;
        currentMs = pollMs;
        void loadLive(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enablePoll, tab, pollMs, loadLive]);

  const filtroOn = false; // consumidor calcula com filtroEvaAtivo se precisar

  return {
    tab,
    data,
    hist,
    histFaltando,
    isLoading,
    refreshing,
    fetchError,
    lastUpdate,
    reload,
    loadLive,
    filtroOn,
    stale: tab === 'live' && isLiveStale(data),
    ageMs: liveAgeMs(data),
  };
}
