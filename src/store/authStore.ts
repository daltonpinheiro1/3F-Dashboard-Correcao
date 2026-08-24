import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SESSION_HOURS = 12;

interface AuthState {
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  userRole: string;
  /** ISO expires; se ausente em sessões antigas, força re-login. */
  sessionExpiresAt: string | null;
  sessionNonce: string | null;
  /** Senha em memória só para RPCs admin na sessão (não persistida). */
  adminPassword: string | null;
  login: (
    email: string,
    name: string,
    role: string,
    opts?: { sessionExpiresAt?: string | null; sessionNonce?: string | null; password?: string },
  ) => void;
  logout: () => void;
  isSessionValid: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      userName: '',
      userEmail: '',
      userRole: '',
      sessionExpiresAt: null,
      sessionNonce: null,
      adminPassword: null,
      login: (email, name, role, opts) => {
        const exp =
          opts?.sessionExpiresAt ||
          new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
        set({
          isAuthenticated: true,
          userEmail: email,
          userName: name,
          userRole: role,
          sessionExpiresAt: exp,
          sessionNonce: opts?.sessionNonce || null,
          adminPassword: opts?.password || null,
        });
      },
      logout: () =>
        set({
          isAuthenticated: false,
          userName: '',
          userEmail: '',
          userRole: '',
          sessionExpiresAt: null,
          sessionNonce: null,
          adminPassword: null,
        }),
      isSessionValid: () => {
        const { isAuthenticated, sessionExpiresAt } = get();
        if (!isAuthenticated) return false;
        if (!sessionExpiresAt) return false;
        const t = Date.parse(sessionExpiresAt);
        if (!Number.isFinite(t) || t < Date.now()) return false;
        return true;
      },
    }),
    {
      name: '3f-dashboard-auth',
      partialize: (s) => ({
        isAuthenticated: s.isAuthenticated,
        userName: s.userName,
        userEmail: s.userEmail,
        userRole: s.userRole,
        sessionExpiresAt: s.sessionExpiresAt,
        sessionNonce: s.sessionNonce,
        // adminPassword NÃO persiste
      }),
    },
  ),
);
