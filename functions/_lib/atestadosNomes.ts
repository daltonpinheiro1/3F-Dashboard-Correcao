/** Comparação de nomes de pessoas: sem acentos, por palavras completas. */

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function semAcentos(s: string | null | undefined): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function tokensNome(s: string | null | undefined): string[] {
  return semAcentos(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !CONECTIVOS.has(t));
}

/** Nome lido no documento x colaborador selecionado (alerta só quando nem prefixo nem palavras batem). */
export function nomeDetectadoDivergente(esperado: string, detectado: string): boolean {
  const exp = semAcentos(esperado).replace(/\s+/g, ' ').trim();
  if (exp.length < 4) return false;
  if (nomesCompativeis(esperado, detectado)) return false;
  return !semAcentos(detectado).replace(/\s+/g, ' ').includes(exp.slice(0, 8));
}

/** Todas as palavras do nome menor (mín. 2) aparecem inteiras no maior. */
export function nomesCompativeis(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokensNome(a);
  const tb = tokensNome(b);
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (menor.length < 2) return false;
  const set = new Set(maior);
  return menor.every((t) => set.has(t));
}
