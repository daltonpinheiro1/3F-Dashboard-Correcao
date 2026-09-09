const TIPOS_NAO_ERRO = new Set(['referencia_tratamento', 'logradouro_acentuacao']);

export type CorrecaoRow = {
  vendedor?: string | null;
  equipe?: string | null;
  supervisor?: string | null;
  campos_alterados?: string[] | null;
  tipos_erro?: string[] | null;
  elapsed_ms?: number | null;
};

export type SmsRow = {
  proposta_id?: string | null;
  vendedor?: string | null;
  equipe?: string | null;
  supervisor?: string | null;
  sms_previo?: boolean | null;
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
  retorno_atualizado_em?: string | null;
};

export type CuboCorrecaoAggregates = {
  dashboard: {
    total_propostas: number;
    total_corrigidas: number;
    taxa_erro_pct: number;
    tempo_medio_ms: number;
    top_erro: string;
    supervisores_ativos: number;
  };
  dashboard_supervisores: Array<{
    supervisor: string;
    equipe: string;
    total_propostas: number;
    total_corrigidas: number;
    taxa_erro_pct: number;
  }>;
  operadores: Array<{
    vendedor: string;
    equipe: string;
    supervisor: string;
    total_propostas: number;
    total_corrigidas: number;
    taxa_erro_pct: number;
    erros_cep: number;
    erros_logradouro: number;
    erros_bairro: number;
    erros_cidade: number;
    erros_uf: number;
    erros_numero: number;
    erros_complemento: number;
    erros_referencia: number;
  }>;
  supervisores: Array<{
    supervisor: string;
    equipe: string;
    total_vendedores: number;
    total_propostas: number;
    total_corrigidas: number;
    taxa_erro_pct: number;
    erros_cep: number;
    erros_referencia: number;
    erros_bairro: number;
  }>;
};

export type CuboOverview = {
  periodo: { de: string; ate: string };
  dashboard: CuboCorrecaoAggregates['dashboard'];
  dashboard_supervisores: CuboCorrecaoAggregates['dashboard_supervisores'];
  operadores: Array<CuboCorrecaoAggregates['operadores'][number] & {
    sms_total: number;
    sms_com: number;
    sms_adesao: number;
    sms_suc_com: number;
    sms_pct_suc: number;
  }>;
  supervisores: Array<CuboCorrecaoAggregates['supervisores'][number] & {
    sms_total: number;
    sms_com: number;
    sms_adesao: number;
    sms_sucesso_com: number;
    sms_sucesso_sem: number;
    sms_pct_suc_com: number;
    sms_pct_suc_sem: number;
  }>;
};

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export function temErroOperacional(tipos: string[] | null | undefined): boolean {
  return (tipos || []).some((tipo) => !TIPOS_NAO_ERRO.has(tipo));
}

function hasReferenciaErro(tipos: string[]): boolean {
  return tipos.some((tipo) => tipo.startsWith('referencia_') && tipo !== 'referencia_tratamento');
}

function vinculo(values: Set<string>, multipleLabel: string): string {
  const sorted = [...values].sort();
  return sorted.length > 1 ? `${multipleLabel}: ${sorted.join(', ')}` : sorted[0] || '';
}

/** Referência golden da semântica que a RPC SQL deve reproduzir. */
export function aggregateCorrecao(rows: CorrecaoRow[]): CuboCorrecaoAggregates {
  let corrigidas = 0;
  let elapsed = 0;
  const erros = new Map<string, number>();
  const supervisoresAtivos = new Set<string>();
  const dashboardSups = new Map<string, {
    supervisor: string; equipe: string; total: number; corrigidas: number;
  }>();
  const operadores = new Map<string, {
    vendedor: string; equipes: Set<string>; supervisores: Set<string>;
    total: number; corrigidas: number; campos: Record<string, number>; referencia: number;
  }>();
  const supervisores = new Map<string, {
    supervisor: string; equipe: string; vendedores: Set<string>;
    total: number; corrigidas: number; cep: number; referencia: number; bairro: number;
  }>();

  for (const row of rows) {
    const tipos = row.tipos_erro || [];
    const campos = row.campos_alterados || [];
    const comErro = temErroOperacional(tipos);
    if (comErro) corrigidas++;
    elapsed += row.elapsed_ms ?? 0;
    for (const tipo of tipos) {
      if (!TIPOS_NAO_ERRO.has(tipo)) erros.set(tipo, (erros.get(tipo) || 0) + 1);
    }
    if (row.supervisor) supervisoresAtivos.add(row.supervisor);

    const dashboardSupervisor = row.supervisor || 'Não identificado';
    const dashboardEquipe = row.equipe || '-';
    const dashboardKey = `${dashboardSupervisor}|${dashboardEquipe}`;
    const ds = dashboardSups.get(dashboardKey) || {
      supervisor: dashboardSupervisor, equipe: dashboardEquipe, total: 0, corrigidas: 0,
    };
    ds.total++;
    if (comErro) ds.corrigidas++;
    dashboardSups.set(dashboardKey, ds);

    const vendedor = row.vendedor || '';
    if (vendedor) {
      const op = operadores.get(vendedor) || {
        vendedor, equipes: new Set<string>(), supervisores: new Set<string>(),
        total: 0, corrigidas: 0, campos: {}, referencia: 0,
      };
      if (row.equipe) op.equipes.add(row.equipe);
      if (row.supervisor) op.supervisores.add(row.supervisor);
      op.total++;
      if (comErro) op.corrigidas++;
      for (const campo of ['cep', 'logradouro', 'bairro', 'cidade', 'uf', 'numero', 'complemento']) {
        if (campos.includes(campo)) op.campos[campo] = (op.campos[campo] || 0) + 1;
      }
      if (hasReferenciaErro(tipos)) op.referencia++;
      operadores.set(vendedor, op);
    }

    const supervisor = row.supervisor || 'Sem supervisor';
    const equipe = row.equipe || '-';
    const supervisorKey = `${supervisor}|${equipe}`;
    const sup = supervisores.get(supervisorKey) || {
      supervisor, equipe, vendedores: new Set<string>(),
      total: 0, corrigidas: 0, cep: 0, referencia: 0, bairro: 0,
    };
    sup.total++;
    if (row.vendedor) sup.vendedores.add(row.vendedor);
    if (comErro) sup.corrigidas++;
    if (campos.includes('cep')) sup.cep++;
    if (campos.includes('bairro')) sup.bairro++;
    if (hasReferenciaErro(tipos)) sup.referencia++;
    supervisores.set(supervisorKey, sup);
  }

  const total = rows.length;
  return {
    dashboard: {
      total_propostas: total,
      total_corrigidas: corrigidas,
      taxa_erro_pct: pct(corrigidas, total),
      tempo_medio_ms: total ? Math.round(elapsed / total) : 0,
      top_erro: [...erros.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
      supervisores_ativos: supervisoresAtivos.size,
    },
    dashboard_supervisores: [...dashboardSups.values()]
      .map((s) => ({
        supervisor: s.supervisor,
        equipe: s.equipe,
        total_propostas: s.total,
        total_corrigidas: s.corrigidas,
        taxa_erro_pct: pct(s.corrigidas, s.total),
      }))
      .filter((s) => s.supervisor !== 'Não identificado' || s.total_propostas > 2)
      .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct),
    operadores: [...operadores.values()].map((o) => ({
      vendedor: o.vendedor,
      equipe: vinculo(o.equipes, 'Múltiplas equipes'),
      supervisor: vinculo(o.supervisores, 'Múltiplos supervisores'),
      total_propostas: o.total,
      total_corrigidas: o.corrigidas,
      taxa_erro_pct: pct(o.corrigidas, o.total),
      erros_cep: o.campos.cep || 0,
      erros_logradouro: o.campos.logradouro || 0,
      erros_bairro: o.campos.bairro || 0,
      erros_cidade: o.campos.cidade || 0,
      erros_uf: o.campos.uf || 0,
      erros_numero: o.campos.numero || 0,
      erros_complemento: o.campos.complemento || 0,
      erros_referencia: o.referencia,
    })),
    supervisores: [...supervisores.values()]
      .map((s) => ({
        supervisor: s.supervisor,
        equipe: s.equipe,
        total_vendedores: s.vendedores.size,
        total_propostas: s.total,
        total_corrigidas: s.corrigidas,
        taxa_erro_pct: pct(s.corrigidas, s.total),
        erros_cep: s.cep,
        erros_referencia: s.referencia,
        erros_bairro: s.bairro,
      }))
      .filter((s) => s.supervisor !== 'Sem supervisor' || s.total_propostas > 2)
      .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct),
  };
}

function foldSmsText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isPortadoConsolidado(row: SmsRow): boolean {
  const ticket = foldSmsText(row.ticket_status);
  if (/(nao\s+portad|cancelad|suspens|pendente|conflito|negado)/.test(ticket)) return false;
  if (
    new Set(['portado', 'falha parcial', 'antigo', 'ativado', 'activated', 'ativo', 'ativa']).has(ticket)
    || ticket.includes('falha parcial')
    || ticket.includes('portado')
    || /\b(antigo|ativado|activated|ativo|ativa)\b/.test(ticket)
  ) return true;
  if (ticket) return false;
  if ((row.classificacao || '').trim().toLowerCase() === 'sucesso') return true;
  const order = foldSmsText(row.order_status);
  return order === 'concluido' || order === 'completed';
}

function dedupeSmsPorProposta(rows: SmsRow[]): SmsRow[] {
  const named = new Map<string, SmsRow>();
  const unnamed: SmsRow[] = [];
  for (const row of rows) {
    const id = String(row.proposta_id || '').trim();
    if (!id) {
      unnamed.push(row);
      continue;
    }
    const previous = named.get(id);
    if (!previous) {
      named.set(id, row);
      continue;
    }
    const prevDate = String(previous.retorno_atualizado_em || '');
    const nextDate = String(row.retorno_atualizado_em || '');
    if (nextDate && !prevDate) named.set(id, row);
    else if (!nextDate && prevDate) named.set(id, previous);
    else if (nextDate !== prevDate) named.set(id, nextDate >= prevDate ? row : previous);
    else if (isPortadoConsolidado(row) && !isPortadoConsolidado(previous)) named.set(id, row);
    else if (!isPortadoConsolidado(row) && isPortadoConsolidado(previous)) named.set(id, previous);
    else named.set(id, row);
  }
  return [...named.values(), ...unnamed];
}

export function mergeSms(
  correcao: CuboCorrecaoAggregates,
  smsRows: SmsRow[],
  periodo: { de: string; ate: string },
): CuboOverview {
  const porVendedor = new Map<string, { total: number; com: number; sucessoCom: number }>();
  const porSupervisor = new Map<string, {
    total: number; com: number; sem: number; sucessoCom: number; sucessoSem: number;
  }>();

  for (const row of dedupeSmsPorProposta(smsRows)) {
    if (row.sms_previo !== true && row.sms_previo !== false) continue;
    const vendedor = row.vendedor || '';
    if (vendedor) {
      const op = porVendedor.get(vendedor) || { total: 0, com: 0, sucessoCom: 0 };
      op.total++;
      if (row.sms_previo === true) {
        op.com++;
        if (isPortadoConsolidado(row)) op.sucessoCom++;
      }
      porVendedor.set(vendedor, op);
    }
    const supervisor = row.supervisor || 'Sem supervisor';
    const equipe = row.equipe || '-';
    const key = `${supervisor}|${equipe}`;
    const sup = porSupervisor.get(key) || {
      total: 0, com: 0, sem: 0, sucessoCom: 0, sucessoSem: 0,
    };
    sup.total++;
    if (row.sms_previo === true) {
      sup.com++;
      if (isPortadoConsolidado(row)) sup.sucessoCom++;
    } else {
      sup.sem++;
      if (isPortadoConsolidado(row)) sup.sucessoSem++;
    }
    porSupervisor.set(key, sup);
  }

  return {
    periodo,
    dashboard: correcao.dashboard,
    dashboard_supervisores: correcao.dashboard_supervisores,
    operadores: correcao.operadores.map((row) => {
      const sms = porVendedor.get(row.vendedor) || { total: 0, com: 0, sucessoCom: 0 };
      return {
        ...row,
        sms_total: sms.total,
        sms_com: sms.com,
        sms_adesao: pct(sms.com, sms.total),
        sms_suc_com: sms.sucessoCom,
        sms_pct_suc: pct(sms.sucessoCom, sms.com),
      };
    }),
    supervisores: correcao.supervisores.map((row) => {
      const sms = porSupervisor.get(`${row.supervisor}|${row.equipe}`) || {
        total: 0, com: 0, sem: 0, sucessoCom: 0, sucessoSem: 0,
      };
      return {
        ...row,
        sms_total: sms.total,
        sms_com: sms.com,
        sms_adesao: pct(sms.com, sms.total),
        sms_sucesso_com: sms.sucessoCom,
        sms_sucesso_sem: sms.sucessoSem,
        sms_pct_suc_com: pct(sms.sucessoCom, sms.com),
        sms_pct_suc_sem: pct(sms.sucessoSem, sms.sem),
      };
    }),
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Não converte payload parcial/erro em métricas zeradas. */
export function parseCorrecaoRpc(value: unknown): CuboCorrecaoAggregates {
  if (!value || typeof value !== 'object') throw new Error('Resposta inválida da RPC de agregações.');
  const data = value as Partial<CuboCorrecaoAggregates>;
  const dashboard = data.dashboard;
  if (
    !dashboard
    || !finiteNumber(dashboard.total_propostas)
    || !finiteNumber(dashboard.total_corrigidas)
    || !finiteNumber(dashboard.taxa_erro_pct)
    || !finiteNumber(dashboard.tempo_medio_ms)
    || typeof dashboard.top_erro !== 'string'
    || !finiteNumber(dashboard.supervisores_ativos)
    || !Array.isArray(data.dashboard_supervisores)
    || !Array.isArray(data.operadores)
    || !Array.isArray(data.supervisores)
  ) {
    throw new Error('Resposta incompleta da RPC de agregações.');
  }
  return data as CuboCorrecaoAggregates;
}
