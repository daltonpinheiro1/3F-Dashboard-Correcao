import { ehVendedorRobo } from './toutboxVisao';

/** cubo-query não tem ilike: o modal baixa o tipo de erro inteiro no período, até este teto. */
export const TETO_PASSAGENS_ERRO = 5000;

type LinhaErro = { proposta_id?: string | null; vendedor?: string | null; equipe?: string | null };

function dobrar(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Uma entrada por proposta, sem robô. Espera as passagens da mais recente para a mais antiga. */
export function propostasUnicasErro<T extends LinhaErro>(rows: T[]): T[] {
  const vistas = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (ehVendedorRobo(row.vendedor)) continue;
    const id = String(row.proposta_id || '').trim();
    if (id) {
      if (vistas.has(id)) continue;
      vistas.add(id);
    }
    out.push(row);
  }
  return out;
}

export function filtrarPropostasErro<T extends LinhaErro>(rows: T[], busca: string): T[] {
  const s = dobrar(busca);
  if (!s) return rows;
  return rows.filter((p) => dobrar(p.proposta_id).includes(s) || dobrar(p.vendedor).includes(s) || dobrar(p.equipe).includes(s));
}
