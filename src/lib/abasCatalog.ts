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
  { id: 'administracao', label: 'Administração', path: '/administracao' },
];

export const ABA_IDS = ABA_CATALOG.map((a) => a.id);

export function abaFromPath(pathname: string): string | null {
  if (pathname === '/usuarios' || pathname.startsWith('/administracao')) return 'administracao';
  if (pathname === '/rr/tv' || pathname.startsWith('/rr')) return 'rr';
  const hit = ABA_CATALOG.find((a) => a.path === pathname || pathname.startsWith(`${a.path}/`));
  return hit?.id || null;
}
