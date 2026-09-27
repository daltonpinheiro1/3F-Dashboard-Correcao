/** Relógio da interseção: oficial, cópia SMS e recorte do contratante. Sem PII. */

export interface RelogioConciliacao {
  gerado_em: string;
  arquivo_ref: string;
  arquivo_em: string | null;
  oficial_em: string | null;
  sms_em: string | null;
  arquivo_linhas: number;
  oficial_os: number;
  intersecao: number;
  so_arquivo: number;
  confianca: { acesso_e_data: number; acesso: number };
  divida: number;
  coerentes: number;
  quarentena: number;
  atraso_sms_horas: number | null;
  mudou: { primeiro_arquivo: boolean; status_mudou: number; entrou: number; saiu: number };
  pares: Array<{ par: string; qtd: number }>;
  nota: string;
}

export function relogioCoerente(dado: RelogioConciliacao | null | undefined): dado is RelogioConciliacao {
  if (!dado) return false;
  if (dado.intersecao > dado.arquivo_linhas) return false;
  if (dado.divida > dado.intersecao) return false;
  if (dado.coerentes > dado.intersecao) return false;
  if (dado.confianca.acesso_e_data + dado.confianca.acesso !== dado.intersecao) return false;
  return Boolean(dado.gerado_em);
}

export function textoAtraso(horas: number | null | undefined): string {
  if (horas == null || Number.isNaN(horas)) return 'Cópia SMS sem leitura nesta geração.';
  if (horas >= 0.5) return `Cópia SMS atrasada ${horas} h em relação ao oficial.`;
  if (horas <= -0.5) return 'Cópia SMS mais nova que o último retorno do oficial.';
  return 'Cópia SMS no mesmo horário do oficial.';
}

export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return 'sem leitura';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
