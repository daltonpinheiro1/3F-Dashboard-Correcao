export type LinhaRankingSms = {
  total: number;
  com_sms: number;
  sem_sms: number;
  sucesso_com_sms: number;
  sucesso_sem_sms: number;
};

export type SomaRankingSms = LinhaRankingSms & {
  linhas: number;
  taxa_sms: number;
  pct_sucesso_com: number;
  pct_sucesso_sem: number;
};

/** Rodapé que fecha com as linhas exibidas do ranking. */
export function somarRankingSms(rows: LinhaRankingSms[]): SomaRankingSms {
  const s = rows.reduce<LinhaRankingSms>((acc, r) => ({
    total: acc.total + r.total,
    com_sms: acc.com_sms + r.com_sms,
    sem_sms: acc.sem_sms + r.sem_sms,
    sucesso_com_sms: acc.sucesso_com_sms + r.sucesso_com_sms,
    sucesso_sem_sms: acc.sucesso_sem_sms + r.sucesso_sem_sms,
  }), { total: 0, com_sms: 0, sem_sms: 0, sucesso_com_sms: 0, sucesso_sem_sms: 0 });
  return {
    ...s,
    linhas: rows.length,
    taxa_sms: s.total > 0 ? (s.com_sms / s.total) * 100 : 0,
    pct_sucesso_com: s.com_sms > 0 ? (s.sucesso_com_sms / s.com_sms) * 100 : 0,
    pct_sucesso_sem: s.sem_sms > 0 ? (s.sucesso_sem_sms / s.sem_sms) * 100 : 0,
  };
}
