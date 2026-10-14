export const ABA_CATALOG: Array<{ id: string; label: string; path: string }> = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'operadores', label: 'Operadores', path: '/operadores' },
  { id: 'supervisores', label: 'Supervisores', path: '/supervisores' },
  { id: 'erros', label: 'Erros', path: '/erros' },
  { id: 'advertencias', label: 'Advertências', path: '/advertencias' },
  { id: 'controle-dp', label: 'Controle DP', path: '/controle-dp' },
  { id: 'atestados', label: 'Atestados', path: '/atestados' },
  { id: 'atestados-solicitar', label: 'Solicitar atestado', path: '/atestados-solicitar' },
  { id: 'evolucao', label: 'Evolução', path: '/evolucao' },
  { id: 'insights', label: 'Insights', path: '/insights' },
  { id: 'sms', label: 'SMS Prévio', path: '/sms' },
  { id: 'disparos', label: 'Disparos', path: '/disparos' },
  { id: 'inteligencia', label: 'Inteligência', path: '/inteligencia' },
  { id: 'operacao', label: 'Operação', path: '/operacao' },
  { id: 'chamadas', label: 'Chamadas', path: '/chamadas' },
  { id: 'hora', label: 'Hora a hora', path: '/hora' },
  { id: 'rr', label: 'RR', path: '/rr' },
  { id: 'discagens', label: 'Discagens', path: '/discagens' },
  { id: 'mailing', label: 'Mailing', path: '/mailing' },
  { id: 'administracao', label: 'Administração', path: '/administracao' },
];

export const ABA_IDS = ABA_CATALOG.map((a) => a.id);

const ABA_ID_SET = new Set(ABA_IDS);

export function isAbaId(value: unknown): value is string {
  return typeof value === 'string' && ABA_ID_SET.has(value);
}

/** Abas exclusivas de admin quando o usuário não tem perfil com abas. */
const ABAS_SO_ADMIN = new Set(['administracao', 'hora', 'rr', 'controle-dp', 'atestados']);
const ABAS_SUPERVISOR = new Set(['disparos', 'inteligencia']);

/**
 * Regra única de acesso por aba (SPA e Pages Functions):
 * role admin sempre passa; perfil com abas exige a aba; sem abas cai no papel.
 */
export function canAccessAbaFor(
  user: { role?: string | null; abas?: readonly string[] | null },
  abaId: string,
): boolean {
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return true;
  const abas = Array.isArray(user.abas) ? user.abas : [];
  if (abas.length) return abas.includes(abaId);
  if (ABAS_SO_ADMIN.has(abaId)) return false;
  if (ABAS_SUPERVISOR.has(abaId)) return role === 'supervisor';
  return role === 'supervisor' || role === 'viewer';
}
