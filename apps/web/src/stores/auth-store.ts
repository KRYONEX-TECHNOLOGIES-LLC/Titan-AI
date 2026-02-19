/**
 * Auth Zustand Store
 * Wraps NextAuth session data for easy consumption across the IDE.
 */
import { create } from 'zustand';

export interface TitanUser {
  id: string;
  name: string | null;
  email: string | null;
  username: string;
  avatarUrl: string;
  githubToken: string;
}

interface AuthState {
  user: TitanUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: TitanUser | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, isAuthenticated: false, isLoading: false }),
}));
