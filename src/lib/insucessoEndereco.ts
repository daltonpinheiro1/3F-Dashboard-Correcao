import { campoLabels, formatErroLabel } from './erroClassification';

const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const;

export type DiffEndereco = { campo: string; de: string; para: string };

export type IndicioEndereco = { campo: string; texto: string };

export type LeituraInsucesso = {
  causa: 'endereco' | 'risco' | 'ausente' | 'outro';
  titulo: string;
  texto: string;
  diffs: DiffEndereco[];
  indicios: IndicioEndereco[];
};

const UF_POR_FAIXA_CEP: Record<string, string[]> = {
  '0': ['SP'],
  '1': ['SP'],
  '2': ['RJ', 'ES'],
  '3': ['MG'],
  '4': ['BA', 'SE'],
  '5': ['PE', 'AL', 'PB', 'RN'],
  '6': ['CE', 'PI', 'MA', 'PA', 'AP', 'AM', 'RR', 'AC'],
  '7': ['DF', 'GO', 'TO', 'MT', 'MS', 'RO'],
  '8': ['PR', 'SC'],
  '9': ['RS'],
};

const NUMERO_INVALIDO = /^(0+|s\/?n|sn|sem\s*n|n\/a|-)$/i;

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

function valorCampo(
  alteracoes: Record<string, { de?: string; para?: string }> | null | undefined,
  campo: (typeof CAMPOS_ENDERECO)[number],
): string {
  const mud = alteracoes?.[campo];
  const para = String(mud?.para || '').trim();
  const de = String(mud?.de || '').trim();
  return para || de;
}

/** Endereço que ficou gravado no cadastro, sem inferência. */
export function enderecoCadastrado(
  alteracoes: Record<string, { de?: string; para?: string }> | null | undefined,
): string {
  const partes = CAMPOS_ENDERECO.map((campo) => valorCampo(alteracoes, campo)).filter(Boolean);
  return partes.join(', ');
}

/** Lê o endereço que foi para a entrega e aponta o campo que não fecha. */
export function indiciosEndereco(
  alteracoes: Record<string, { de?: string; para?: string }> | null | undefined,
): IndicioEndereco[] {
  const tem = (campo: (typeof CAMPOS_ENDERECO)[number]) => Boolean(alteracoes && campo in alteracoes);
  const cep = valorCampo(alteracoes, 'cep').replace(/\D/g, '');
  const logradouro = valorCampo(alteracoes, 'logradouro');
  const numero = valorCampo(alteracoes, 'numero');
  const bairro = valorCampo(alteracoes, 'bairro');
  const cidade = valorCampo(alteracoes, 'cidade');
  const uf = valorCampo(alteracoes, 'uf').replace(/[^a-z]/gi, '').toUpperCase();
  const out: IndicioEndereco[] = [];
  const temAlgo = Boolean(cep || logradouro || numero || bairro || cidade || uf);
  if (!temAlgo) return out;

  if (tem('cep') && !cep) out.push({ campo: 'CEP', texto: 'CEP vazio no que foi para a entrega.' });
  else if (cep && cep.length !== 8) out.push({ campo: 'CEP', texto: `CEP com ${cep.length} dígitos.` });
  else if (cep && /^(\d)\1{7}$/.test(cep)) out.push({ campo: 'CEP', texto: 'CEP com dígitos repetidos.' });

  if (tem('logradouro') && !logradouro) out.push({ campo: 'Logradouro', texto: 'Rua vazia.' });
  else if (logradouro && logradouro.trim().length < 3) out.push({ campo: 'Logradouro', texto: 'Rua curta demais para localizar.' });
  else if (logradouro && /\b(qd|quadra|lt|lote|bloco|bl)\s*\d/i.test(logradouro)) {
    out.push({ campo: 'Logradouro', texto: 'Quadra, lote ou bloco está escrito na rua.' });
  }

  if (tem('numero') && !numero) out.push({ campo: 'Número', texto: 'Número vazio.' });
  else if (numero && NUMERO_INVALIDO.test(numero.trim())) out.push({ campo: 'Número', texto: `Número “${numero.trim()}” não localiza a casa.` });

  if (/^(?:n[º°]?\s*)?\d+\s+\S/i.test(bairro)) {
    out.push({ campo: 'Bairro', texto: 'O bairro começa com número. O número da casa pode estar neste campo.' });
  }

  if (uf && uf.length !== 2) out.push({ campo: 'UF', texto: 'UF fora do padrão de duas letras.' });
  if (cep.length === 8 && uf.length === 2) {
    const faixa = UF_POR_FAIXA_CEP[cep[0]] || [];
    if (faixa.length && !faixa.includes(uf)) {
      out.push({ campo: 'CEP × UF', texto: `CEP ${cep} é da faixa ${faixa.join('/')} e a UF gravada é ${uf}.` });
    }
  }
  if (tem('cidade') && !cidade && (cep || logradouro)) out.push({ campo: 'Cidade', texto: 'Cidade vazia.' });
  return out;
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
  const indicios = indiciosEndereco(alteracoes);
  const resumo = indicios.map((i) => `${i.campo}: ${i.texto}`).join(' ');
  if (/area de risco|\brisco\b/.test(texto)) {
    return {
      causa: 'risco',
      titulo: 'Área de risco',
      texto: 'A Toutbox recusou a região. Isso não é divergência de CEP, rua ou número no cadastro.',
      diffs: [],
      indicios: [],
    };
  }
  if (/endereco invalid|endereco incorret|endereco inexist|destinatario desconhec|problema endereco/.test(texto)) {
    return {
      causa: 'endereco',
      titulo: /problema endereco/.test(texto) ? 'Problema no endereço' : 'Endereço inválido',
      texto: resumo
        || (diffs.length
          ? 'A correção do cadastro aponta o campo que saiu diferente do que foi para a entrega.'
          : 'A Toutbox cancelou por endereço e este cadastro não gravou CEP, rua ou número para apontar o campo.'),
      diffs,
      indicios,
    };
  }
  if (/ausente|nao procurado|mudou-se|mudou se/.test(texto)) {
    return {
      causa: 'ausente',
      titulo: 'Não foi falta de endereço',
      texto: 'O evento da Toutbox é de destinatário ou tentativa, não de campo incorreto.',
      diffs: [],
      indicios: [],
    };
  }
  return {
    causa: 'outro',
    titulo: 'Motivo da Toutbox',
    texto: resumo
      || (diffs.length
        ? 'Há correção de endereço no cadastro. O evento da Toutbox não fecha sozinho como erro de digitação.'
        : 'O evento não descreve uma divergência de endereço.'),
    diffs: diffs.length ? diffs : [],
    indicios,
  };
}
