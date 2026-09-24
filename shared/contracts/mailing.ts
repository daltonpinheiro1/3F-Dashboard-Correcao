import { contractError, contractOk, isRecord, type ContractResult } from './runtime';

export type MailingIntervalo = [number, number];

export type MailingTendencia = {
  inclinacao: number;
  rel_hora: number;
  t: number;
  significativa: boolean;
  pontos: number;
};

export type MailingCurvaPonto = {
  k: number;
  rotulo?: string;
  em_risco: number;
  contatos: number;
  taxa: number;
  ic_baixo: number;
  ic_alto: number;
  acumulada: number;
};

export type MailingDistribuicao = {
  n: number;
  rotulo: string;
  phones: number;
  pct: number;
  contatos: number;
  sucesso: number;
};

export type MailingHora = {
  hora: string;
  tentativas: number;
  alo_robo: number;
  contatos: number;
  sucesso: number;
  taxa: number;
};

export type MailingPulso = { ts: string; tentativas: number; contatos: number; sucesso: number };

export type MailingCorte = {
  k: number;
  rendimento_rel: number;
  pct_volume: number;
} | null;

export type MailingDesgaste = {
  indice: number;
  status: 'saudavel' | 'atencao' | 'desgastado' | 'esgotando' | string;
  componentes: Record<string, number>;
};

export type MailingHoje = {
  tentativas: number;
  phones: number;
  alo_robo: number;
  contatos: number;
  sucesso: number;
  giro: number;
  taxa_alo: number;
  taxa_contato: number;
  taxa_transferencia: number;
  taxa_sucesso_contato: number;
};

export type MailingEstoque = {
  clientes: number;
  virgens: number;
  trabalhados: number;
  disponiveis: number;
  agendados: number;
  finalizados: number;
  bloqueados_tentativa: number;
  spin: number;
  discados_vida: number;
  localizados_vida: number;
  sucesso_vida: number;
  loc_5min: number;
  loc_30min: number;
};

export type MailingPropensao = {
  p_contato: number;
  p_contato_ic: MailingIntervalo;
  p_sucesso_contato: number;
  sucesso_100mil: number;
  sucesso_100mil_ic: MailingIntervalo;
  score: number | null;
};

export type MailingPrevisao = {
  ritmo: number;
  contatos: number;
  contatos_ic: MailingIntervalo;
  sucesso: number;
  sucesso_ic: MailingIntervalo;
};

export type MailingItem = {
  id: number;
  nome: string;
  nome_curto: string;
  campanha_op: string;
  campanha_nome: string;
  status_eva: number | null;
  inicio: string | null;
  fim: string | null;
  hoje: MailingHoje;
  estoque: MailingEstoque;
  propensao: MailingPropensao;
  previsao_hora: MailingPrevisao;
  folego_dias: number | null;
  tendencia: MailingTendencia;
  desgaste: MailingDesgaste;
  curva: MailingCurvaPonto[];
  corte: MailingCorte;
  serie_hora: MailingHora[];
};

export type MailingRecomendacao = {
  tipo: string;
  nivel: 'acao' | 'alerta' | 'oportunidade' | string;
  titulo: string;
  texto: string;
  mailing?: number;
  campanha_op?: string;
};

export type MailingResumo = {
  mailings: number;
  tentativas: number;
  phones: number;
  alo_robo: number;
  contatos: number;
  sucesso: number;
  giro: number;
  taxa_alo: number;
  taxa_contato: number;
  taxa_transferencia: number;
  taxa_sucesso_contato: number;
  sucesso_100mil: number;
  insistencia_pct: number;
  disponiveis: number;
  folego_dias: number | null;
  desgaste_medio: number;
  previsao_contatos_hora: number;
  previsao_contatos_ic: MailingIntervalo;
  previsao_sucesso_hora: number;
  previsao_sucesso_ic: MailingIntervalo;
  tendencia: MailingTendencia;
};

export type MailingSaude = {
  versao: number;
  data: string;
  updated_at: string;
  definicoes: Record<string, string>;
  resumo: MailingResumo;
  curva: MailingCurvaPonto[];
  distribuicao: MailingDistribuicao[];
  corte: MailingCorte;
  serie_hora: MailingHora[];
  serie_dia: MailingPulso[];
  mailings: MailingItem[];
  recomendacoes: MailingRecomendacao[];
};

const CAMPOS_PROIBIDOS = /"(phone_number|area_code|cpf|telefone|contact)"\s*:/i;

export function parseMailingSaude(value: unknown): ContractResult<MailingSaude> {
  if (!isRecord(value)) return contractError('payload não é objeto');
  if (typeof value.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.data)) {
    return contractError('data ausente');
  }
  if (typeof value.updated_at !== 'string') return contractError('updated_at ausente');
  if (!isRecord(value.resumo)) return contractError('resumo ausente');
  for (const k of ['curva', 'distribuicao', 'serie_hora', 'serie_dia', 'mailings', 'recomendacoes'] as const) {
    if (!Array.isArray(value[k])) return contractError(`${k} não é lista`);
  }
  const mailings = value.mailings as unknown[];
  for (const m of mailings) {
    if (!isRecord(m) || typeof m.id !== 'number' || !isRecord(m.hoje) || !isRecord(m.propensao)) {
      return contractError('mailing inválido');
    }
  }
  if (CAMPOS_PROIBIDOS.test(JSON.stringify(mailings))) {
    return contractError('payload traz dado pessoal');
  }
  return contractOk(value as unknown as MailingSaude);
}

export type MailingDiaIndice = {
  data: string;
  atualizado: string;
  tentativas: number;
  phones: number;
  alo_robo?: number;
  contatos: number;
  sucesso: number;
  giro: number;
  taxa_alo?: number;
  taxa_contato: number;
  sucesso_100mil?: number;
  insistencia_pct?: number;
  desgaste_medio: number | null;
  disponiveis: number;
  folego_dias?: number | null;
  mailings?: number;
  mailings_folego_curto?: number;
};

export type MailingDias = {
  versao?: number;
  dias: MailingDiaIndice[];
};

export function parseMailingDias(value: unknown): ContractResult<MailingDias> {
  if (!isRecord(value)) return contractError('índice não é objeto');
  if (!Array.isArray(value.dias)) return contractError('dias não é lista');
  const dias: MailingDiaIndice[] = [];
  for (const d of value.dias) {
    if (!isRecord(d) || typeof d.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) {
      return contractError('dia inválido no índice');
    }
    dias.push(d as unknown as MailingDiaIndice);
  }
  return contractOk({ versao: typeof value.versao === 'number' ? value.versao : 1, dias });
}
