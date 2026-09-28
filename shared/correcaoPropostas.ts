export type PassagemCorrecao = {
  proposta_id?: string | null;
  vendedor?: string | null;
  tipos_erro?: string[] | null;
  campos_alterados?: string[] | null;
};

const ehRobo = (nome: string | null | undefined) => /^roboadm\d*$/i.test(String(nome || '').trim());

/**
 * O robô grava uma linha por passagem: a mesma proposta aparece várias vezes.
 * Uma proposta conta uma vez; tem erro se alguma passagem achou erro.
 * Espera as linhas em ordem cronológica.
 */
export function consolidarPorProposta<T extends PassagemCorrecao>(rows: T[]): T[] {
  const porProposta = new Map<string, T>();
  const avulsas: T[] = [];
  for (const row of rows) {
    const id = String(row.proposta_id || '').trim();
    if (!id) {
      avulsas.push(row);
      continue;
    }
    const atual = porProposta.get(id);
    if (!atual) {
      porProposta.set(id, { ...row });
      continue;
    }
    const humano = !ehRobo(row.vendedor) || ehRobo(atual.vendedor);
    porProposta.set(id, {
      ...(humano ? row : atual),
      tipos_erro: [...new Set([...(atual.tipos_erro || []), ...(row.tipos_erro || [])])],
      campos_alterados: [...new Set([...(atual.campos_alterados || []), ...(row.campos_alterados || [])])],
    });
  }
  return [...porProposta.values(), ...avulsas];
}
