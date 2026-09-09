import { type ReactNode, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { logoutDashboardSession } from '../lib/sessionLogout';
import { bootstrapLegacyDashboardSession } from '../lib/dashboardSession';

interface AuthGuardProps {
  children: ReactNode;
  /** Se true, só quem tem aba Administração / role admin. */
  requireAdmin?: boolean;
  /** Roles permitidos (legado). Preferir `aba`. */
  roles?: string[];
  /** Id de aba do catálogo (ex.: hora, discagens). */
  aba?: string;
}

export function AuthGuard({ children, requireAdmin = false, roles, aba }: AuthGuardProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userRole = useAuthStore((s) => s.userRole);
  const canAccessAba = useAuthStore((s) => s.canAccessAba);
  const isSessionValid = useAuthStore((s) => s.isSessionValid);

  useEffect(() => {
    if (isAuthenticated && !isSessionValid()) {
      logoutDashboardSession();
      navigate('/login', { replace: true });
      return;
    }
    if (isAuthenticated) void bootstrapLegacyDashboardSession();
  }, [isAuthenticated, isSessionValid, navigate]);

  if (!isAuthenticated || !isSessionValid()) {
    return <Navigate to="/login" replace />;
  }

  const abaId = aba;
  let allowed = true;
  if (requireAdmin) {
    allowed = canAccessAba('administracao') || (userRole || '').toLowerCase() === 'admin';
  } else if (abaId) {
    allowed = canAccessAba(abaId);
  } else if (roles?.length) {
    allowed = roles.map((r) => r.toLowerCase()).includes((userRole || '').toLowerCase());
  }

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
