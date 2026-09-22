import { campoLabels, formatErroLabel } from './erroClassification';

const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const;

export type DiffEndereco = { campo: string; de: string; para: string };

export type LeituraInsucesso = {
  causa: 'endereco' | 'risco' | 'ausente' | 'outro';
  titulo: string;
  texto: string;
  diffs: DiffEndereco[];
};

function fold(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function diffsEndereco(
  alteracoes: Record<string, { de?: string; para?: string }> | null | undefined,
  tipos: string[] | null | undefined,
): DiffEndereco[] {
  const out: DiffEndereco[] = [];
  for (const campo of CAMPOS_ENDERECO) {
    const mud = alteracoes?.[campo];
    if (!mud) continue;
    const de = String(mud.de || '').trim();
    const para = String(mud.para || '').trim();
    if (!de && !para) continue;
    if (de === para) continue;
    out.push({ campo: campoLabels[campo] || campo, de: de || '(vazio)', para: para || '(vazio)' });
  }
  if (out.length) return out;
  return (tipos || [])
    .filter((t) => /cep_|logradouro_|bairro_|cidade_|numero_|complemento_|uf_/.test(t) && t !== 'logradouro_acentuacao')
    .map((t) => ({ campo: formatErroLabel(t), de: '', para: '' }));
}

/** Cruza o motivo da Toutbox com a correção de endereço já gravada no cadastro. */
export function lerInsucessoEntrega(
  evento: string | null | undefined,
  status: string | null | undefined,
  alteracoes: Record<string, { de?: string; para?: string }> | null | undefined,
  tipos: string[] | null | undefined,
): LeituraInsucesso {
  const texto = fold(`${evento || ''} ${status || ''}`);
  const diffs = diffsEndereco(alteracoes, tipos);
  if (/area de risco|\brisco\b/.test(texto)) {
    return {
      causa: 'risco',
      titulo: 'Área de risco',
      texto: 'A Toutbox recusou a região. Isso não é divergência de CEP, rua ou número no cadastro.',
      diffs: [],
    };
  }
  if (/endereco invalid|endereco incorret|endereco inexist|destinatario desconhec/.test(texto)) {
    return {
      causa: 'endereco',
      titulo: 'Endereço inválido',
      texto: diffs.length
        ? 'A correção do cadastro aponta o campo que saiu diferente do que foi para a entrega.'
        : 'A Toutbox cancelou por endereço inválido e este cadastro não tem correção de CEP, logradouro, número ou bairro.',
      diffs,
    };
  }
  if (/ausente|nao procurado|mudou-se|mudou se/.test(texto)) {
    return {
      causa: 'ausente',
      titulo: 'Não foi falta de endereço',
      texto: 'O evento da Toutbox é de destinatário ou tentativa, não de campo incorreto.',
      diffs: [],
    };
  }
  return {
    causa: 'outro',
    titulo: 'Motivo da Toutbox',
    texto: diffs.length
      ? 'Há correção de endereço no cadastro. O evento da Toutbox não fecha sozinho como erro de digitação.'
      : 'O evento não descreve uma divergência de endereço.',
    diffs: diffs.length ? diffs : [],
  };
}
