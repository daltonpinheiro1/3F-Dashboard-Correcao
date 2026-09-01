import { memo } from 'react';
import { Radio } from 'lucide-react';
import { useOperacionalEvents } from '../../hooks/useOperacionalEvents';

/** Isola o polling de eventos — evita re-render da página inteira a cada 12s. */
export const OperacionalEventsStrip = memo(function OperacionalEventsStrip() {
  const { events, lastPoll, refresh } = useOperacionalEvents(true);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Radio size={14} className="text-emerald-500" aria-hidden />
        Eventos {lastPoll ? new Date(lastPoll).toLocaleTimeString('pt-BR') : '—'}
        <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => void refresh()}>
          Poll
        </button>
      </div>
      {events.length > 0 ? (
        <div className="card p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-2">Feed em tempo real</p>
          <ul className="space-y-1 max-h-28 overflow-y-auto text-sm">
            {events.slice(0, 6).map((ev) => (
              <li key={ev.id} className="flex gap-2">
                <span
                  className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    ev.severidade === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : ev.severidade === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {ev.severidade}
                </span>
                <span className="truncate">{ev.titulo}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});
