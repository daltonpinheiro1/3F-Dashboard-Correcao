import {
  contractError,
  contractOk,
  isRecord,
  type ContractResult,
} from './runtime';

const ARRAY_SECTIONS = [
  'ativas',
  'jornada',
  'pausas_por_tipo',
  'sessoes',
  'chamadas_recente',
  'tma_por_tabulacao',
  'tma_hora',
  'top_tabulacao',
  'por_campanha',
  'serie_hora',
  'hora_supervisor',
  'hora_motivo',
  'hora_operador',
  'hora_sup_motivo',
  'ranking_operadores',
  'ofensores_tab',
  'cpc_por_campanha',
  'vendas_por_campanha',
  'vendas_hora',
] as const;

const RECORD_SECTIONS = ['meta', 'kpis_operacao', 'kpis_chamadas'] as const;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type EvaSnapshotKind = 'live' | 'historical';

function validScalarMap(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) =>
        item === null ||
        typeof item === 'number' ||
        typeof item === 'boolean' ||
        typeof item === 'string',
    )
  );
}

function validObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

function validateDiscagens(value: unknown): string | null {
  if (!isRecord(value)) return 'discagens deve ser um objeto.';
  if (!isRecord(value.kpis)) return 'discagens.kpis deve ser um objeto.';
  if (!validScalarMap(value.kpis)) return 'discagens.kpis contém valores inválidos.';
  for (const [key, section] of Object.entries(value)) {
    if (
      key !== 'kpis' &&
      (key.startsWith('por_') ||
        key.startsWith('serie_') ||
        key.startsWith('alertas_') ||
        key.startsWith('insights_') ||
        key.startsWith('outliers_') ||
        key === 'tab_hora' ||
        key === 'drop_por_tab_op') &&
      !validObjectArray(section)
    ) {
      return `discagens.${key} deve ser uma lista de objetos.`;
    }
  }
  return null;
}

/**
 * Contrato tolerante a snapshots históricos antigos: seções podem faltar,
 * mas as seções presentes precisam preservar seu tipo e o payload não pode
 * ser um objeto vazio/irreconhecível.
 */
export function parseEvaSnapshot<T = Record<string, unknown>>(
  input: unknown,
  options: { kind: EvaSnapshotKind; expectedDate?: string },
): ContractResult<T> {
  if (!isRecord(input)) return contractError('Snapshot EVA deve ser um objeto JSON.');

  if ('updated_at' in input && typeof input.updated_at !== 'string') {
    return contractError('updated_at deve ser texto.');
  }
  if ('data' in input) {
    if (typeof input.data !== 'string' || !ISO_DAY.test(input.data.slice(0, 10))) {
      return contractError('data deve usar YYYY-MM-DD.');
    }
    if (options.expectedDate && input.data.slice(0, 10) !== options.expectedDate) {
      return contractError(`data não corresponde ao snapshot ${options.expectedDate}.`);
    }
  }

  for (const key of ARRAY_SECTIONS) {
    if (key in input && !validObjectArray(input[key])) {
      return contractError(`${key} deve ser uma lista de objetos.`);
    }
  }
  for (const key of RECORD_SECTIONS) {
    if (key in input && !validScalarMap(input[key])) {
      return contractError(`${key} deve ser um objeto de valores escalares.`);
    }
  }
  if ('discagens' in input) {
    const error = validateDiscagens(input.discagens);
    if (error) return contractError(error);
  }

  const hasDataSection =
    ARRAY_SECTIONS.some((key) => key in input) ||
    RECORD_SECTIONS.some((key) => key in input) ||
    'discagens' in input;
  if (!hasDataSection) {
    return contractError('Snapshot EVA não contém nenhuma seção de dados reconhecida.');
  }

  if (options.kind === 'live') {
    if (typeof input.updated_at !== 'string' || !input.updated_at.trim()) {
      return contractError('Snapshot EVA live sem updated_at.');
    }
    if (typeof input.data !== 'string') {
      return contractError('Snapshot EVA live sem data.');
    }
  }

  return contractOk(input as T);
}
