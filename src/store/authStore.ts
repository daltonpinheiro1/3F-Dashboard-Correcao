import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  userName: string;
  userEmail: string;
  userRole: string;
  login: (email: string, name: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      userName: '',
      userEmail: '',
      userRole: '',
      login: (email, name, role) =>
        set({ isAuthenticated: true, userEmail: email, userName: name, userRole: role }),
      logout: () =>
        set({ isAuthenticated: false, userName: '', userEmail: '', userRole: '' }),
    }),
    { name: '3f-dashboard-auth' }
  )
);
