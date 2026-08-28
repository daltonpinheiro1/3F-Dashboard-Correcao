import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listAtestadoAudit, type AtestadoAuditEntry } from '../../lib/atestadosService';

const ACTION_LABELS: Record<string, string> = {
  create: 'Protocolado',
  patch: 'Atualizado',
  thumb_regenerado: 'Miniatura regenerada',
};

export function AtestadoAuditTimeline({ atestadoId }: { atestadoId: string }) {
  const [rows, setRows] = useState<AtestadoAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listAtestadoAudit(atestadoId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [atestadoId]);

  if (loading) {
    return (
      <p className="text-xs text-gray-500 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" /> Carregando histórico…
      </p>
    );
  }
  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Histórico</p>
      <ol className="space-y-2 border-l-2 border-gray-200 ml-1 pl-3">
        {rows.map((e) => (
          <li key={e.id} className="text-[11px] text-gray-600 relative">
            <span className="absolute -left-[1.15rem] top-1 w-2 h-2 rounded-full bg-blue-400" />
            <span className="font-medium text-gray-800">
              {ACTION_LABELS[e.action] || e.action}
            </span>
            {e.actor_nome || e.actor_email ? (
              <span className="text-gray-500"> · {e.actor_nome || e.actor_email}</span>
            ) : null}
            {e.payload?.status != null ? (
              <span className="text-gray-500"> → {String(e.payload.status)}</span>
            ) : null}
            <br />
            <time className="text-[10px] text-gray-400">
              {new Date(e.created_at).toLocaleString('pt-BR')}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
