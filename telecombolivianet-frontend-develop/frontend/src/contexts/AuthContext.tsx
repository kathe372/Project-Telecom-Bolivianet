
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useShallow } from 'zustand/react/shallow';
import type { UserRole } from '@/types/auth.types';


export interface AuthUser {
  userId:   string;
  fullName: string;
  email:    string;
  role:     UserRole;
  roles:    UserRole[];
}

interface AuthContextValue {
  user:            AuthUser | null;
  isAuthenticated: boolean;
  logout:          () => void;
}


const AuthContext = createContext<AuthContextValue | undefined>(undefined);


export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    userId, role, fullName, email, isInitializing,
    initializeAuth, isAuthenticated, clearSession,
  } = useAuthStore(useShallow(s => ({
    userId:         s.userId,
    role:           s.role,
    fullName:       s.fullName,
    email:          s.email,
    isInitializing: s.isInitializing,
    initializeAuth: s.initializeAuth,
    isAuthenticated: s.isAuthenticated,
    clearSession:   s.clearSession,
  })));

  useEffect(() => {
    initializeAuth();
  }, []);

  const user: AuthUser | null =
    userId && role
      ? {
          userId,
          fullName: fullName ?? '',
          email:    email    ?? '',
          role,
          roles:    [role],
        }
      : null;

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: isAuthenticated(),
        logout:          clearSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}
