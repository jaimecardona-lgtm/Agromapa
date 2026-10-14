import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Solo claves públicas (anon). La clave service_role/secret NUNCA se usa en el frontend:
// todas las operaciones de negocio pasan por FastAPI con el access token del usuario.
function createSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Cliente de Supabase Auth, o null si el entorno no tiene VITE_SUPABASE_* configuradas. */
export const supabase = createSupabaseClient();

export const authConfigured = supabase !== null;
