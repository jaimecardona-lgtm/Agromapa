import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AxiosError } from 'axios';
import type { Session } from '@supabase/supabase-js';
import { authConfigured, supabase } from '@/services/supabase';
import { errorDetail, identityApi, type BusinessRole, type MeResponse } from '@/services/identity';
import { getStoredPlayerId, resetPlayerId } from '@/services/gameScores';
import { setAccessToken } from './tokenStore';
import { rolesForChoice } from './roles';
import {
  AuthContext,
  type AccountUser,
  type AuthActionResult,
  type AuthContextValue,
  type AuthStatus,
  type SignUpInput,
} from './AuthContext';

// Roles elegidos en el registro. Si la cuenta requiere confirmación por correo, se
// aplican al primer inicio de sesión de ese mismo correo (no a otra cuenta de la pestaña).
const PENDING_ROLES_KEY = 'raices-pending-roles';

interface PendingRoles {
  email: string;
  roles: BusinessRole[];
}

function readPendingRoles(): PendingRoles | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ROLES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRoles;
    return typeof parsed.email === 'string' && Array.isArray(parsed.roles) ? parsed : null;
  } catch {
    return null;
  }
}

function writePendingRoles(value: PendingRoles | null): void {
  try {
    if (value) window.sessionStorage.setItem(PENDING_ROLES_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_ROLES_KEY);
  } catch {
    // Sin sessionStorage el registro sigue; los roles se pueden activar desde "Mi cuenta".
  }
}

/** Mensajes en español para los errores habituales de Supabase Auth. */
export function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (text.includes('already registered')) return 'Ya existe una cuenta con este correo.';
  if (text.includes('password should be at least')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (text.includes('email not confirmed')) return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (text.includes('rate limit')) return 'Hiciste demasiados intentos. Espera unos minutos.';
  return 'No pudimos completar la operación. Intenta de nuevo.';
}

/** Mensaje fijo para la UI: el detalle técnico solo va a consola en desarrollo. */
const ME_ERROR_MESSAGE = 'No pudimos cargar tu cuenta.';
const ME_MAX_ATTEMPTS = 2;
const ME_RETRY_DELAY_MS = 800;

/** Fallo transitorio: sin respuesta (red/timeout) o error del servidor. Un 401/403/404 no se reintenta. */
function isTransientError(error: unknown): boolean {
  const status = (error as AxiosError | undefined)?.response?.status;
  return status === undefined || status >= 500;
}

/** Vinculación de partidas invitadas: en segundo plano, sin bloquear la cuenta ni borrar nada si falla. */
function linkGuestScoresInBackground(playerId: string) {
  identityApi.linkGuestScores(playerId).catch((error: unknown) => {
    if (import.meta.env.DEV) {
      console.info('[auth] partidas de invitado pendientes:', errorDetail(error, 'se reintentará al volver a entrar'));
    }
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(authConfigured ? 'loading' : 'anonymous');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    for (let attempt = 1; attempt <= ME_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await identityApi.getMe();
        setMe(response.data);
        setMeError(null);
        return;
      } catch (error) {
        if (attempt < ME_MAX_ATTEMPTS && isTransientError(error)) {
          await new Promise((resolve) => window.setTimeout(resolve, ME_RETRY_DELAY_MS));
          continue;
        }
        if (import.meta.env.DEV) {
          console.warn('[auth] /api/me no disponible:', errorDetail(error, 'sin detalle'));
        }
        // Un fallo al refrescar NO borra la cuenta ya cargada (roles, productor): solo marca el error.
        setMeError(ME_ERROR_MESSAGE);
        return;
      }
    }
  }, []);

  // Sesión de Supabase -> token en memoria para el cliente HTTP.
  useEffect(() => {
    if (!supabase) return undefined;

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'anonymous');
      if (!nextSession) {
        setMe(null);
        setMeError(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Al existir sesión: aplicar roles pendientes, vincular partidas de invitado y cargar /api/me.
  const userId = session?.user.id ?? null;
  const userEmail = session?.user.email ?? null;
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    async function syncAccount() {
      const pending = readPendingRoles();
      if (pending && userEmail && pending.email === userEmail.toLowerCase()) {
        writePendingRoles(null);
        for (const role of pending.roles) {
          try {
            await identityApi.activateRole(role);
          } catch (error) {
            console.error(`No se pudo activar el rol ${role}:`, errorDetail(error, 'error de red'));
          }
        }
      }

      // Orden: /api/me primero (cuenta, roles, productor) y después la vinculación de partidas.
      if (!cancelled) await refreshMe();

      // El player_id se conserva en almacenamiento hasta vincularse; un fallo se reintenta al volver a entrar.
      // Un player_id ya reclamado por otra cuenta responde 409 y se ignora sin molestar al usuario.
      const playerId = getStoredPlayerId();
      if (playerId && !cancelled) linkGuestScoresInBackground(playerId);
    }

    syncAccount();
    return () => {
      cancelled = true;
    };
  }, [userId, userEmail, refreshMe]);

  const signUp = useCallback(async ({ email, password, displayName, choice }: SignUpInput): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: 'Las cuentas no están disponibles en este entorno.' };

    const normalizedEmail = email.trim().toLowerCase();
    writePendingRoles({ email: normalizedEmail, roles: rolesForChoice(choice) });

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { display_name: displayName.trim() } },
    });

    if (error) {
      writePendingRoles(null);
      return { ok: false, message: translateAuthError(error.message) };
    }
    return { ok: true, needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    if (!supabase) return { ok: false, message: 'Las cuentas no están disponibles en este entorno.' };

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return { ok: false, message: translateAuthError(error.message) };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    writePendingRoles(null);
    setAccessToken(null);
    setMe(null);
    resetPlayerId();
    if (supabase) await supabase.auth.signOut();
  }, []);

  const setRoleActive = useCallback(
    async (role: BusinessRole, active: boolean): Promise<AuthActionResult> => {
      if (!session) return { ok: false, message: 'Inicia sesión para cambiar tus roles.' };
      try {
        if (active) await identityApi.activateRole(role);
        else await identityApi.deactivateRole(role);
        await refreshMe();
        return { ok: true };
      } catch (error) {
        return { ok: false, message: errorDetail(error, 'No pudimos cambiar el rol. Intenta de nuevo.') };
      }
    },
    [session, refreshMe],
  );

  const user = useMemo<AccountUser | null>(
    () => (session ? { id: session.user.id, email: session.user.email ?? null } : null),
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfigured,
      status,
      user,
      me,
      meError,
      roles: me?.roles ?? [],
      signUp,
      signIn,
      signOut,
      refreshMe,
      setRoleActive,
    }),
    [status, user, me, meError, signUp, signIn, signOut, refreshMe, setRoleActive],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
