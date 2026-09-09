import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SESSION_HOURS = 12;

interface AuthState {
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  userRole: string;
  perfilSlug: string;
  abas: string[];
  /** ISO expires; se ausente em sessões antigas, força re-login. */
  sessionExpiresAt: string | null;
  sessionNonce: string | null;
  /** Senha em memória só para RPCs admin na sessão (não persistida). */
  adminPassword: string | null;
  login: (
    email: string,
    name: string,
    role: string,
    opts?: {
      sessionExpiresAt?: string | null;
      sessionNonce?: string | null;
      password?: string;
      abas?: string[];
      perfilSlug?: string;
    },
  ) => void;
  logout: () => void;
  clearLegacySessionNonce: () => void;
  isSessionValid: () => boolean;
  canAccessAba: (abaId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      userName: '',
      userEmail: '',
      userRole: '',
      perfilSlug: '',
      abas: [],
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
          perfilSlug: opts?.perfilSlug || role,
          abas: Array.isArray(opts?.abas) ? opts!.abas : [],
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
          perfilSlug: '',
          abas: [],
          sessionExpiresAt: null,
          sessionNonce: null,
          adminPassword: null,
        }),
      clearLegacySessionNonce: () => set({ sessionNonce: null }),
      isSessionValid: () => {
        const { isAuthenticated, sessionExpiresAt } = get();
        if (!isAuthenticated) return false;
        if (!sessionExpiresAt) return false;
        const t = Date.parse(sessionExpiresAt);
        if (!Number.isFinite(t) || t < Date.now()) return false;
        return true;
      },
      canAccessAba: (abaId: string) => {
        const { abas, userRole } = get();
        if (abas.length) return abas.includes(abaId);
        const role = (userRole || '').toLowerCase();
        if (role === 'admin') return true;
        if (abaId === 'administracao' || abaId === 'hora' || abaId === 'rr' || abaId === 'controle-dp' || abaId === 'atestados') {
          return false;
        }
        if (abaId === 'disparos' || abaId === 'inteligencia') {
          return role === 'supervisor';
        }
        return role === 'admin' || role === 'supervisor' || role === 'viewer';
      },
    }),
    {
      name: '3f-dashboard-auth',
      version: 3,
      migrate: (persisted) => {
        const s = { ...(persisted as AuthState), adminPassword: null } as AuthState;
        s.abas = Array.isArray(s.abas) ? s.abas : [];
        s.perfilSlug = s.perfilSlug || s.userRole || '';
        return s;
      },
      partialize: (s) => ({
        isAuthenticated: s.isAuthenticated,
        userName: s.userName,
        userEmail: s.userEmail,
        userRole: s.userRole,
        perfilSlug: s.perfilSlug,
        abas: s.abas,
        sessionExpiresAt: s.sessionExpiresAt,
        // Credencial de sessão fica somente no cookie HttpOnly.
      }),
    },
  ),
);
