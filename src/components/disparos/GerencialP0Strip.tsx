import { memo, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { dashboardSessionHeaders } from '../../lib/dashboardSession';
import { detectarOportunidades } from '../../lib/portabilidadeProjecoes';
import { n } from '../../lib/disparosFormat';
import type { CmpMes, Fatia, FunilPayload, HistoricoPonto } from '../../types/portabilidade';

type Props = {
  mes: string;
  g: FunilPayload['gerencial'];
  rec: FunilPayload['reconciliacao'];
  funil?: FunilPayload;
  cmpMes: CmpMes;
  historicoMes: HistoricoPonto | null;
  onOpenFatia?: (id: string, fatia: Fatia) => void;
};

export const GerencialP0Strip = memo(function GerencialP0Strip({
  mes,
  g,
  rec,
  funil,
  cmpMes,
  historicoMes,
  onOpenFatia,
}: Props) {
  const sentRef = useRef<string>('');

  const p0 = useMemo(() => {
    const all = detectarOportunidades({ g, rec, funil, cmpMes, historicoMes });
    return all.filter((o) => o.prioridade === 'P0');
  }, [g, rec, funil, cmpMes, historicoMes]);

  useEffect(() => {
    if (!p0.length) return;
    const sig = `${mes}:${p0.map((o) => o.id).join(',')}`;
    if (sentRef.current === sig) return;
    const storageKey = `p0-alert:${sig}`;
    if (sessionStorage.getItem(storageKey)) {
      sentRef.current = sig;
      return;
    }

    void (async () => {
      try {
        const r = await fetch('/api/portabilidade-p0-alert', {
          method: 'POST',
          headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ mes, alertas: p0 }),
        });
        if (r.ok) {
          sessionStorage.setItem(storageKey, String(Date.now()));
          sentRef.current = sig;
        }
      } catch {
        /* silencioso — alerta opcional */
      }
    })();
  }, [mes, p0]);

  if (!p0.length) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-xl border border-rose-300 bg-gradient-to-r from-rose-50 to-orange-50 px-4 py-3 shadow-sm"
    >
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-950">
        <AlertTriangle size={16} className="shrink-0 text-rose-600" />
        {p0.length} alerta{p0.length === 1 ? '' : 's'} P0 — ação imediata
      </p>
      <ul className="space-y-2">
        {p0.map((op) => (
          <li
            key={op.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-rose-200/80 bg-white/70 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold text-rose-950">{op.titulo}</p>
              <p className="text-rose-900/80">{op.descricao}</p>
              {op.acao && <p className="mt-0.5 font-medium text-rose-800">→ {op.acao}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {op.valor != null && (
                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-900">
                  {n(op.valor)}
                </span>
              )}
              {op.fatiaId && onOpenFatia && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenFatia(op.fatiaId!, {
                      id: op.fatiaId!,
                      label: op.titulo,
                      grupo: 'fila',
                      cor: 'rose',
                      descricao: op.descricao,
                      count: op.valor ?? 0,
                      pct: 0,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-800"
                >
                  Ver fatia <ArrowRight size={10} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
