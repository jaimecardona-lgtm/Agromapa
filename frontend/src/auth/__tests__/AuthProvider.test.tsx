import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, translateAuthError } from '../AuthProvider';
import { useAuth } from '../AuthContext';
import { getAccessToken } from '../tokenStore';

const h = vi.hoisted(() => {
  const listeners: Array<(event: string, session: unknown) => void> = [];
  return {
    listeners,
    client: {
      auth: {
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          listeners.push(callback);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(async () => ({ error: null })),
      },
    },
    identity: {
      getMe: vi.fn(),
      activateRole: vi.fn(async () => ({ data: { roles: [] } })),
      deactivateRole: vi.fn(async () => ({ data: { roles: [] } })),
      linkGuestScores: vi.fn(async () => ({ data: { linked: 0 } })),
    },
  };
});

vi.mock('@/services/supabase', () => ({ supabase: h.client, authConfigured: true }));
vi.mock('@/services/identity', () => ({
  identityApi: h.identity,
  errorDetail: (_error: unknown, fallback: string) => fallback,
}));

const ME = {
  id: 'user-1',
  email: 'ana@example.com',
  profile: { display_name: 'Ana' },
  roles: ['producer'],
  producer_profile: null,
  buyer_profile: null,
};

const PLAYER_ID = '6f1f5c3e-2d3a-4b7e-9a1c-1234567890ab';
const SESSION = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'ana@example.com' },
};

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="roles">{auth.roles.join(',')}</span>
      <span data-testid="name">{auth.me?.profile.display_name ?? ''}</span>
      <button onClick={() => void auth.signOut()}>Cerrar sesión</button>
    </div>
  );
}

function emitSession(session: unknown) {
  act(() => {
    h.listeners.forEach((listener) => listener('SIGNED_IN', session));
  });
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    h.listeners.length = 0;
    vi.clearAllMocks();
    h.identity.getMe.mockResolvedValue({ data: ME });
  });

  it('starts anonymous when Supabase reports no initial session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    // Supabase siempre emite INITIAL_SESSION al suscribirse; sin sesión llega null.
    act(() => {
      h.listeners.forEach((listener) => listener('INITIAL_SESSION', null));
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(getAccessToken()).toBeNull();
  });

  it('keeps the session, stores the token in memory and loads /api/me', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    emitSession(SESSION);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(getAccessToken()).toBe('token-123');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('producer'));
    expect(screen.getByTestId('name')).toHaveTextContent('Ana');
  });

  it('links the guest player id once a session exists', async () => {
    window.localStorage.setItem('raices-player-id', PLAYER_ID);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    emitSession(SESSION);

    await waitFor(() => expect(h.identity.linkGuestScores).toHaveBeenCalledWith(PLAYER_ID));
  });

  it('logs out, clears the token and forgets the guest identity', async () => {
    window.localStorage.setItem('raices-player-id', PLAYER_ID);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    emitSession(SESSION);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(h.client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(window.localStorage.getItem('raices-player-id')).toBeNull();
  });

  it('stores pending roles for the chosen signup and reports confirmation', async () => {
    h.client.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    let result: unknown;

    function SignUpProbe() {
      const auth = useAuth();
      return (
        <button
          onClick={async () => {
            result = await auth.signUp({
              email: 'Ana@Example.com',
              password: 'clave-segura-123',
              displayName: 'Ana',
              choice: 'both',
            });
          }}
        >
          registrar
        </button>
      );
    }

    render(
      <AuthProvider>
        <SignUpProbe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'registrar' }));

    await waitFor(() => expect(result).toEqual({ ok: true, needsConfirmation: true }));
    expect(h.client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@example.com', options: { data: { display_name: 'Ana' } } }),
    );
    expect(JSON.parse(window.sessionStorage.getItem('raices-pending-roles') ?? '{}')).toEqual({
      email: 'ana@example.com',
      roles: ['producer', 'buyer'],
    });
  });

  it('translates invalid credentials without exposing the raw Supabase message', async () => {
    h.client.auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });
    let result: unknown;

    function SignInProbe() {
      const auth = useAuth();
      return (
        <button
          onClick={async () => {
            result = await auth.signIn('ana@example.com', 'mal');
          }}
        >
          entrar
        </button>
      );
    }

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'entrar' }));

    await waitFor(() => expect(result).toEqual({ ok: false, message: 'Correo o contraseña incorrectos.' }));
  });

  it('maps known Supabase messages to Spanish and falls back to a generic one', () => {
    expect(translateAuthError('User already registered')).toBe('Ya existe una cuenta con este correo.');
    expect(translateAuthError('Something unexpected: secret_internal_trace')).toBe(
      'No pudimos completar la operación. Intenta de nuevo.',
    );
  });
});
