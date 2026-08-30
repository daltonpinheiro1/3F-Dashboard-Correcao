/** Validação e helpers compartilhados — APIs portabilidade / Disparos. */

const PROPOSTA_RE = /^3F-\d{5,12}$/i;

/** Normaliza entrada do usuário para formato 3F-XXXXXXXX. */
export function normalizePropostaInput(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^3F-/i.test(s)) return `3F-${s.replace(/^3F-/i, '')}`;
  if (/^\d+$/.test(s)) return `3F-${s}`;
  return s;
}

/** Retorna proposta canônica ou null se inválida (bloqueia injeção PostgREST). */
export function validateProposta(raw: string): string | null {
  const norm = normalizePropostaInput(raw);
  if (!PROPOSTA_RE.test(norm)) return null;
  return `3F-${norm.replace(/^3F-/i, '')}`;
}

/** Dígitos após prefixo 3F- (uso em filtros eq alternativos). */
export function propostaNumero(proposta: string): string {
  return proposta.replace(/^3F-/i, '');
}

/** Valor seguro para filtros PostgREST eq/in (sem parênteses ou vírgulas). */
export function postgrestEq(value: string): string {
  return encodeURIComponent(value);
}
