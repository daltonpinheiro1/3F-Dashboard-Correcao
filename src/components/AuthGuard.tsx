import { type ReactNode, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface AuthGuardProps {
  children: ReactNode;
  /** Se true, só admin. Preferir `roles` quando houver mais de um perfil. */
  requireAdmin?: boolean;
  /** Roles permitidos (ex.: admin + supervisor). Se omitido e sem requireAdmin, qualquer autenticado. */
  roles?: string[];
}

export function AuthGuard({ children, requireAdmin = false, roles }: AuthGuardProps) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userRole = useAuthStore((s) => s.userRole);
  const isSessionValid = useAuthStore((s) => s.isSessionValid);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (isAuthenticated && !isSessionValid()) {
      logout();
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isSessionValid, logout, navigate]);

  if (!isAuthenticated || !isSessionValid()) {
    return <Navigate to="/login" replace />;
  }

  const allowed = roles?.length
    ? roles.map((r) => r.toLowerCase()).includes((userRole || '').toLowerCase())
    : requireAdmin
      ? (userRole || '').toLowerCase() === 'admin'
      : true;

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
