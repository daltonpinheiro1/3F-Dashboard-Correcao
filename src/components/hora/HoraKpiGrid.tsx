import { AlertCircle, Clock, Gauge, PhoneCall, Target, TrendingDown } from 'lucide-react';
import { fmtHms, fmtPerda } from '../../lib/evaDash';
import { Kpi } from './HoraKpis';

export type HoraDiscIntervalo = {
  dialed: number;
  receptivo?: boolean;
  tabPct?: number;
  tabuladas?: number;
  contact?: number | string;
  locPct?: number;
};

export type HoraRecorte = {
  total: number;
  cpc?: number;
  pct: number;
  sucesso?: number;
};

type Props = {
  hora: string;
  discIntervalo: HoraDiscIntervalo;
  recorte: HoraRecorte;
  ontemRecorte: HoraRecorte;
  ontemIso: string;
  dataIso?: string | null;
  metaDia: number;
  down: boolean;
  ocupacao: number;
  capacidade: number;
  tma: number;
  perdaHora: { vendas: number; chamadas: number };
};

/** Grid de KPIs do topo da Hora a hora — PR 2/3 do split. */
export function HoraKpiGrid({
  hora,
  discIntervalo,
  recorte,
  ontemRecorte,
  ontemIso,
  dataIso,
  metaDia,
  down,
  ocupacao,
  capacidade,
  tma,
  perdaHora,
}: Props) {
  const vsLabel =
    ontemIso && dataIso
      ? (() => {
          const d0 = new Date(`${dataIso}T00:00:00`);
          const d1 = new Date(d0);
          d1.setDate(d1.getDate() - 1);
          const d1iso = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
          return ontemIso === d1iso ? 'vs ontem' : `vs ${ontemIso.slice(8)}/${ontemIso.slice(5, 7)}`;
        })()
      : 'vs ontem';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
      <Kpi
        label={hora === 'todas' ? 'Discadas' : `Discadas ${hora}h`}
        value={discIntervalo.dialed > 0 ? discIntervalo.dialed : '—'}
        icon={PhoneCall}
        sub={discIntervalo.dialed > 0 ? 'dialer' : 'sem dial_details'}
      />
      <Kpi
        label={
          discIntervalo.receptivo
            ? hora === 'todas'
              ? 'Tab ÷ Discadas'
              : `Tab% ${hora}h`
            : hora === 'todas'
              ? 'Localizou / agente'
              : `Localizou ${hora}h`
        }
        value={
          discIntervalo.dialed > 0
            ? discIntervalo.receptivo
              ? `${discIntervalo.tabPct}%`
              : discIntervalo.contact ?? '—'
            : '—'
        }
        icon={Target}
        sub={
          discIntervalo.dialed > 0
            ? discIntervalo.receptivo
              ? `${discIntervalo.tabuladas} tabs · funil tipo Migração`
              : `${discIntervalo.locPct}% Loc`
            : '—'
        }
      />
      <Kpi label={hora === 'todas' ? 'Tabuladas no dia' : `Tabuladas ${hora}h`} value={recorte.total} icon={Clock} />
      <Kpi
        label="CPC do intervalo"
        value={`${recorte.pct.toFixed(1)}%`}
        warn={down}
        icon={Target}
        sub={`meta dia ${metaDia}% · ${recorte.cpc ?? 0}/${recorte.total}`}
      />
      <Kpi
        label={vsLabel}
        value={ontemRecorte.total ? `${(recorte.pct - ontemRecorte.pct).toFixed(1)} p.p.` : '—'}
        icon={TrendingDown}
        sub={
          ontemRecorte.total
            ? `${ontemIso || 'base'} ${ontemRecorte.pct}% · vol ${ontemRecorte.total}`
            : 'sem histórico D-1/D-2'
        }
      />
      <Kpi
        label="Ocupação"
        value={`${ocupacao.toFixed(0)}%`}
        icon={Gauge}
        sub={`cap. ${Math.round(capacidade)} · TMA ${fmtHms(tma)}`}
      />
      <Kpi
        label="Perda no intervalo"
        value={fmtPerda(perdaHora.vendas)}
        warn={perdaHora.vendas >= 0.5}
        icon={AlertCircle}
        sub={`${fmtPerda(perdaHora.chamadas)} cham. est.`}
      />
    </div>
  );
}
