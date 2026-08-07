/**
 * Classificação de erros operacionais vs tratamento automático.
 *
 * ERRO OPERACIONAL (conta no ranking do vendedor):
 * - cep_incorreto, logradouro_incorreto, bairro_incorreto, cidade_incorreta,
 *   uf_incorreta, numero_invalido, complemento_incorreto, complemento_link,
 *   referencia_vazia, referencia_generica, referencia_link
 *
 * NÃO É ERRO (tratamento do bot — NÃO conta):
 * - referencia_tratamento (bot melhorou referência que já tinha conteúdo útil)
 * - logradouro_acentuacao (apenas padronização de acentos)
 */

/** Tipos que NÃO contam como erro operacional do vendedor */
export const TIPOS_NAO_ERRO: ReadonlySet<string> = new Set([
  'referencia_tratamento',
  'logradouro_acentuacao',
]);

/** Labels amigáveis para exibição no dashboard */
export const erroLabels: Record<string, string> = {
  cep_incorreto: 'CEP incorreto',
  logradouro_incorreto: 'Logradouro incorreto',
  logradouro_acentuacao: 'Logradouro (acentuação)',
  bairro_incorreto: 'Bairro incorreto',
  cidade_incorreta: 'Cidade incorreta',
  uf_incorreta: 'UF incorreta',
  numero_invalido: 'Número inválido',
  complemento_link: 'Complemento com link',
  complemento_incorreto: 'Complemento incorreto',
  referencia_vazia: 'Referência vazia',
  referencia_generica: 'Referência genérica',
  referencia_link: 'Referência com link',
  referencia_tratamento: 'Referência (tratamento IA)',
};

/** Cores para barras e badges */
export const erroColors: Record<string, string> = {
  cep_incorreto: 'bg-red-500',
  logradouro_incorreto: 'bg-orange-500',
  logradouro_acentuacao: 'bg-orange-200',
  bairro_incorreto: 'bg-purple-500',
  cidade_incorreta: 'bg-pink-500',
  uf_incorreta: 'bg-rose-500',
  numero_invalido: 'bg-amber-500',
  complemento_link: 'bg-yellow-500',
  complemento_incorreto: 'bg-yellow-400',
  referencia_vazia: 'bg-teal-500',
  referencia_generica: 'bg-teal-400',
  referencia_link: 'bg-cyan-500',
  referencia_tratamento: 'bg-blue-300',
};

/** Labels para campos de endereço */
export const campoLabels: Record<string, string> = {
  cep: 'CEP',
  logradouro: 'Logradouro',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  numero: 'Número',
  complemento: 'Complemento',
  referencia: 'Referência',
};

/**
 * Verifica se um tipo_erro é erro operacional (conta no ranking).
 */
export function isErroOperacional(tipo: string): boolean {
  return !TIPOS_NAO_ERRO.has(tipo);
}

/**
 * Filtra tipos_erro retornando apenas os que são erros operacionais.
 */
export function filtrarErrosOperacionais(tipos: string[]): string[] {
  return tipos.filter(isErroOperacional);
}

/**
 * Verifica se uma proposta tem erro operacional real.
 * Ignora referencia_tratamento e logradouro_acentuacao.
 */
export function temErroOperacional(tiposErro: string[]): boolean {
  return tiposErro.some(isErroOperacional);
}

/**
 * Formata label amigável para um tipo de erro.
 */
export function formatErroLabel(key: string): string {
  return erroLabels[key] ?? key.replace(/_/g, ' ');
}
