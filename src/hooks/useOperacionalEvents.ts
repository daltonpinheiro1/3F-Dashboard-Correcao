import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventsRecent, type OperacionalEvent } from '../lib/operacionalIntelService';

const POLL_MS = 12_000;

export function useOperacionalEvents(enabled = true) {
  const [events, setEvents] = useState<OperacionalEvent[]>([]);
  const [lastPoll, setLastPoll] = useState<string | null>(null);
  const sinceRef = useRef<string | undefined>(undefined);

  const poll = useCallback(async () => {
    try {
      const { rows, server_time } = await fetchEventsRecent(sinceRef.current);
      if (rows.length) {
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const merged = [...rows.filter((r) => !ids.has(r.id)), ...prev];
          return merged.slice(0, 40);
        });
        sinceRef.current = server_time;
      } else if (!sinceRef.current) {
        sinceRef.current = server_time;
      }
      setLastPoll(server_time);
    } catch {
      /* polling silencioso */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void poll();
    const t = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(t);
  }, [enabled, poll]);

  return { events, lastPoll, refresh: poll };
}
