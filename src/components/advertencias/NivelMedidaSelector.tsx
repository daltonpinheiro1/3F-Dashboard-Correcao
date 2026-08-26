import { AlertTriangle } from 'lucide-react';
import { escalaCritica, nivelPorIdx, requerAprovacaoDp } from '../../lib/advertenciasEscala';
import {
  ADVERTENCIA_ESCRITA_CICLOS,
  MEDIDA_CATEGORIAS,
  SUSPENSAO_OPCOES,
  labelEtapa,
  nivelIdxFromSelecao,
  parseNivelIdx,
  resumoMedida,
  type MedidaCategoria,
  type MedidaSelecao,
} from '../../lib/escalaMedidaUi';
import { ChipBar } from '../ui/TabBar';
import { Field } from './Field';

export function NivelMedidaSelector({
  nivelIdx,
  sugerido,
  onChange,
  onManualChange,
}: {
  nivelIdx: number;
  sugerido: number;
  onChange: (idx: number) => void;
  onManualChange: () => void;
}) {
  const sel = parseNivelIdx(nivelIdx);
  const sugeridoSel = parseNivelIdx(sugerido);

  const apply = (next: MedidaSelecao) => {
    onManualChange();
    onChange(nivelIdxFromSelecao(next));
  };

  const setCategoria = (cat: MedidaCategoria) => {
    if (cat === sel.categoria) return;
    const base: MedidaSelecao = { categoria: cat };
    if (cat === 'advertencia_escrita') {
      base.cicloEscrita =
        sugeridoSel.categoria === 'advertencia_escrita'
          ? sugeridoSel.cicloEscrita
          : ADVERTENCIA_ESCRITA_CICLOS[0].ciclo;
    }
    if (cat === 'suspensao') {
      base.diasSuspensao =
        sugeridoSel.categoria === 'suspensao' ? sugeridoSel.diasSuspensao : SUSPENSAO_OPCOES[0].dias;
    }
    apply(base);
  };

  const precisaDp = requerAprovacaoDp(nivelIdx);
  const critico = escalaCritica(nivelIdx);
  const n = nivelPorIdx(nivelIdx);

  return (
    <div className="space-y-3">
      <Field label="Tipo de medida">
        <select
          className="input-field bg-white"
          value={sel.categoria}
          onChange={(e) => setCategoria(e.target.value as MedidaCategoria)}
        >
          {MEDIDA_CATEGORIAS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.hint}
            </option>
          ))}
        </select>
      </Field>

      {sel.categoria === 'advertencia_escrita' && (
        <Field label="Qual advertência escrita?">
          <select
            className="input-field bg-white"
            value={String(sel.cicloEscrita ?? 1)}
            onChange={(e) =>
              apply({ ...sel, cicloEscrita: Number(e.target.value) })
            }
          >
            {ADVERTENCIA_ESCRITA_CICLOS.map((c) => (
              <option key={c.ciclo} value={c.ciclo}>
                {c.label} — {c.contexto} ({labelEtapa(nivelPorIdx(c.idx))})
              </option>
            ))}
          </select>
        </Field>
      )}

      {sel.categoria === 'suspensao' && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Dias de suspensão</p>
          <ChipBar
            ariaLabel="Dias de suspensão"
            active={String(sel.diasSuspensao ?? 1)}
            onChange={(id) => apply({ ...sel, diasSuspensao: Number(id) })}
            chips={SUSPENSAO_OPCOES.map((s) => ({
              id: String(s.dias),
              label: `${s.dias} dia${s.dias > 1 ? 's' : ''}${s.critico ? ' ⚠' : ''}`,
            }))}
          />
        </div>
      )}

      {sel.categoria === 'apuracao_juridica' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle size={12} /> Estágio final da escala
          </p>
          <p className="mt-0.5">{nivelPorIdx(10).label} — avaliar Jurídico/DP ou desligamento.</p>
        </div>
      )}

      <div className="rounded-lg border border-[#0f234b]/15 bg-white px-3 py-2 text-xs">
        <p className="font-semibold text-[#0f234b]">{resumoMedida(nivelIdx)}</p>
        <p className="text-gray-500 mt-0.5">
          {precisaDp ? 'Fluxo: aprovação DP → impressão → entrega' : 'Fluxo: PDF gerado na hora → impressão → entrega'}
        </p>
        {nivelIdx !== sugerido && (
          <p className="text-amber-700 mt-1">
            Sugerido pelo histórico: {resumoMedida(sugerido)}
          </p>
        )}
      </div>

      {precisaDp && sel.categoria === 'suspensao' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Suspensão de <strong>{n.diasSuspensao} dia{n.diasSuspensao > 1 ? 's' : ''}</strong>: ficará{' '}
          <strong>pendente de aprovação do DP</strong> antes da impressão.
        </p>
      )}

      {precisaDp && sel.categoria === 'apuracao_juridica' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Apuração jurídica: ficará <strong>pendente de aprovação do DP</strong> antes da impressão oficial.
        </p>
      )}

      {!precisaDp && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
          Feedback/advertência: ao salvar, o <strong>PDF é gerado na hora</strong> (sem fila do DP).
        </p>
      )}

      {critico && (
        <p className="text-xs font-semibold text-red-700">
          Estágio crítico: considere relatório para Jurídico/DP ou desligamento.
        </p>
      )}
    </div>
  );
}
