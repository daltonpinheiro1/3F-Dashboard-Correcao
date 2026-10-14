import { ABA_CATALOG } from '../../shared/abasCatalog';

export { ABA_CATALOG, ABA_IDS, canAccessAbaFor, isAbaId } from '../../shared/abasCatalog';

export function abaFromPath(pathname: string): string | null {
  if (pathname === '/usuarios' || pathname.startsWith('/administracao')) return 'administracao';
  if (pathname === '/rr/tv' || pathname.startsWith('/rr')) return 'rr';
  const hit = ABA_CATALOG.find((a) => a.path === pathname || pathname.startsWith(`${a.path}/`));
  return hit?.id || null;
}

/** Primeira rota do catálogo que o perfil pode abrir (evita loop /dashboard). */
export function firstAllowedPath(canAccess: (abaId: string) => boolean): string {
  const hit = ABA_CATALOG.find((a) => canAccess(a.id));
  return hit?.path || '/login';
}
