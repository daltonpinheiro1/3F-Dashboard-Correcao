import { AlertTriangle, History, Radio } from 'lucide-react';
import { isEvaDbDown, labelCampanhaOp, type CampanhaOp, type EvaPayload } from '../lib/evaDash';

/** Chip persistente: modo + período + campanha (diagnóstico em 1 s). */
export function EvaModoResumo(props: {
  tab: 'live' | 'hist';
  campanha: CampanhaOp;
  dateFrom?: string;
  dateTo?: string;
}) {
  const modo = props.tab === 'live' ? 'Ao vivo' : 'Histórico';
  const periodo =
    props.tab === 'hist' && props.dateFrom && props.dateTo
      ? `${props.dateFrom} → ${props.dateTo}`
      : 'hoje BRT';
  const camp =
    props.campanha === 'TODAS' ? 'Todas as campanhas' : labelCampanhaOp(props.campanha);
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 text-[11px]"
      role="status"
      aria-label={`Modo ${modo}, ${periodo}, ${camp}`}
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
          props.tab === 'live'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
        }`}
      >
        {props.tab === 'live' ? <Radio size={12} aria-hidden /> : <History size={12} aria-hidden />}
        {modo}
      </span>
      <span className="inline-flex rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1 font-medium">
        {periodo}
      </span>
      <span className="inline-flex rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-1 font-medium">
        {camp}
      </span>
    </div>
  );
}

/** Banner quando meta.eva_db=down (coleta SQL pausada; live pode ser cache). */
export function EvaSqlDownBanner(props: {
  meta?: EvaPayload['meta'] | null;
  visible?: boolean;
}) {
  if (props.visible === false) return null;
  if (!isEvaDbDown(props.meta)) return null;
  const motivo = String(props.meta?.eva_db_motivo || props.meta?.stale_reason || '').trim();
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
      <div>
        <div className="font-semibold">Coleta SQL EVA pausada</div>
        <div className="text-amber-900/90 text-xs mt-0.5">
          O live pode estar republicando o último snapshot bom (números congelados).
          {motivo ? ` Motivo: ${motivo.slice(0, 120)}.` : ' Aguardando MSSQL via VPN.'}
        </div>
      </div>
    </div>
  );
}

/** Histórico sem nenhum dia carregado — não confundir com operação zerada. */
export function EvaHistVazio(props: {
  dateFrom: string;
  dateTo: string;
  faltando: string[];
  onIrAoVivo: () => void;
  onLimpar?: () => void;
}) {
  const n = props.faltando.length;
  return (
    <div
      className="card p-8 mb-6 text-center border border-indigo-200 bg-indigo-50/60"
      role="status"
      aria-live="polite"
    >
      <History size={28} className="mx-auto text-indigo-600 mb-3" aria-hidden />
      <h2 className="text-base font-bold text-indigo-950">Nenhum snapshot no período</h2>
      <p className="text-sm text-indigo-900/80 mt-2 max-w-lg mx-auto">
        Histórico {props.dateFrom} → {props.dateTo}
        {n > 0 ? ` · ${n} dia(s) sem arquivo gerencial` : ' · período inválido ou ainda sem selagem'}.
        Isto não significa piso operacional zero — use <strong>Ao vivo</strong> para o dia corrente.
      </p>
      {n > 0 && (
        <p className="text-xs text-indigo-800/70 mt-2">
          Ex.: {props.faltando.slice(0, 5).join(', ')}
          {n > 5 ? '…' : ''}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={props.onIrAoVivo} className="btn-primary text-sm py-2 px-4">
          Ir para Ao vivo
        </button>
        {props.onLimpar ? (
          <button type="button" onClick={props.onLimpar} className="btn-secondary text-sm py-2 px-4">
            Limpar filtros
          </button>
        ) : null}
      </div>
    </div>
  );
}
