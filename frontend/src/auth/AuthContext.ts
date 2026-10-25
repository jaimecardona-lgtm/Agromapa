import { createContext, useContext } from 'react';
import type { BusinessRole, MeResponse } from '@/services/identity';
import type { RoleChoice } from './roles';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AccountUser {
  id: string;
  email: string | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  choice: RoleChoice;
}

export type AuthActionResult =
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; message: string };

export interface AuthContextValue {
  /** false si el entorno no tiene VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. */
  configured: boolean;
  status: AuthStatus;
  user: AccountUser | null;
  me: MeResponse | null;
  /** Motivo legible si /api/me falló (p. ej. backend o Auth no disponibles). Null si no hay error. */
  meError: string | null;
  roles: BusinessRole[];
  signUp: (input: SignUpInput) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setRoleActive: (role: BusinessRole, active: boolean) => Promise<AuthActionResult>;
}

const UNAVAILABLE_MESSAGE = 'Las cuentas no están disponibles en este entorno.';

/** Valor por defecto: sin proveedor, la app se comporta como invitado. */
export const defaultAuthValue: AuthContextValue = {
  configured: false,
  status: 'anonymous',
  user: null,
  me: null,
  meError: null,
  roles: [],
  signUp: async () => ({ ok: false, message: UNAVAILABLE_MESSAGE }),
  signIn: async () => ({ ok: false, message: UNAVAILABLE_MESSAGE }),
  signOut: async () => undefined,
  refreshMe: async () => undefined,
  setRoleActive: async () => ({ ok: false, message: UNAVAILABLE_MESSAGE }),
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthValue);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
