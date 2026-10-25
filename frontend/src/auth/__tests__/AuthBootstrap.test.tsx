import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProducerGate } from '@/components/auth/ProducerGate';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../AuthContext';

// Supabase y los endpoints se simulan con la forma real de axios ({ data } o error con response.status).
const h = vi.hoisted(() => ({
  authCallback: null as null | ((event: string, session: unknown) => void),
  identity: { getMe: vi.fn(), linkGuestScores: vi.fn(), activateRole: vi.fn() },
  playerId: 'player-1' as string | null,
}));

vi.mock('@/services/supabase', () => ({
  authConfigured: true,
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        h.authCallback = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: async () => undefined,
    },
  },
}));

vi.mock('@/services/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/identity')>();
  return { ...actual, identityApi: h.identity };
});

vi.mock('@/services/gameScores', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/gameScores')>();
  return { ...actual, getStoredPlayerId: () => h.playerId, resetPlayerId: () => undefined };
});

const SESSION = { access_token: 'token-de-prueba', user: { id: 'user-1', email: 'jaime@example.com' } };
const ME = {
  id: 'user-1',
  email: 'jaime@example.com',
  profile: { id: 'user-1', display_name: 'Jaime Cardona' },
  roles: ['producer'],
  producer_profile: null,
  buyer_profile: null,
};

function httpError(status: number, detail?: string) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: detail ? { detail } : {} } });
}

function Probe() {
  const { status, roles, me, meError, refreshMe } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="roles">{roles.join(',')}</span>
      <span data-testid="me">{me ? 'loaded' : 'none'}</span>
      <span data-testid="me-error">{meError ?? ''}</span>
      <button type="button" onClick={() => void refreshMe()}>
        Refrescar cuenta
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <AuthProvider>
      <Probe />
      <ProducerGate>
        <p>CONTENIDO PRODUCTIVO</p>
      </ProducerGate>
    </AuthProvider>,
  );
}

async function signIn() {
  await act(async () => {
    h.authCallback?.('SIGNED_IN', SESSION);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  h.playerId = 'player-1';
  h.authCallback = null;
  h.identity.getMe.mockResolvedValue({ data: ME });
  h.identity.linkGuestScores.mockResolvedValue({ data: { player_id: 'player-1', linked: 0 } });
  h.identity.activateRole.mockResolvedValue({ data: { roles: ['producer'] } });
});

describe('bootstrap de sesión: /api/me primero, vinculación en segundo plano', () => {
  it('sesión detectada: /api/me se pide antes que game-scores/link', async () => {
    renderApp();
    await signIn();

    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('producer'));
    expect(h.identity.getMe).toHaveBeenCalledTimes(1);
    expect(h.identity.getMe.mock.invocationCallOrder[0]).toBeLessThan(
      h.identity.linkGuestScores.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('game-scores/link colgado no bloquea la cuenta ni el contenido productivo', async () => {
    h.identity.linkGuestScores.mockReturnValue(new Promise(() => undefined));
    renderApp();
    await signIn();

    expect(await screen.findByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
    expect(screen.getByTestId('me')).toHaveTextContent('loaded');
  });

  it('game-scores/link 503 no borra usuario, roles ni me', async () => {
    h.identity.linkGuestScores.mockRejectedValue(
      httpError(503, 'El servicio de autenticación no está disponible en este momento.'),
    );
    renderApp();
    await signIn();

    await waitFor(() => expect(h.identity.linkGuestScores).toHaveBeenCalledWith('player-1'));
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('roles')).toHaveTextContent('producer');
    expect(screen.getByTestId('me')).toHaveTextContent('loaded');
    expect(screen.getByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
  });

  it('sin player_id pendiente no pide la vinculación', async () => {
    h.playerId = null;
    renderApp();
    await signIn();

    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('producer'));
    expect(h.identity.linkGuestScores).not.toHaveBeenCalled();
  });
});

describe('estados de la cuenta: loading, transitorio y cargada', () => {
  it('mientras /api/me no responde: "Restaurando tu sesión…", roles vacíos sin CTA de activar', async () => {
    h.identity.getMe.mockReturnValue(new Promise(() => undefined));
    renderApp();
    await signIn();

    expect(await screen.findByText('Restaurando tu sesión…')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('me')).toHaveTextContent('none');
    expect(screen.queryByRole('button', { name: 'Activar rol productor' })).not.toBeInTheDocument();
    expect(screen.queryByText(/no tiene el rol productor/)).not.toBeInTheDocument();
  });

  it('503 transitorio en el primer intento: reintenta automáticamente y muestra la cuenta', async () => {
    h.identity.getMe
      .mockRejectedValueOnce(httpError(503, 'Timeout validando la sesión'))
      .mockResolvedValueOnce({ data: ME });
    renderApp();
    await signIn();

    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('producer'), { timeout: 3000 });
    expect(h.identity.getMe).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('me-error')).toHaveTextContent('');
    expect(screen.getByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
  });

  it('dos 503 seguidos: "No pudimos cargar tu cuenta." con Reintentar, sin "activar rol"', async () => {
    h.identity.getMe.mockRejectedValue(httpError(503));
    renderApp();
    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar tu cuenta.');
    expect(screen.queryByRole('button', { name: 'Activar rol productor' })).not.toBeInTheDocument();
    expect(h.identity.getMe).toHaveBeenCalledTimes(2);
  });

  it('Reintentar manual vuelve a pedir /api/me y muestra la cuenta', async () => {
    h.identity.getMe.mockRejectedValueOnce(httpError(503)).mockRejectedValueOnce(httpError(503));
    renderApp();
    await signIn();
    await screen.findByRole('alert');

    h.identity.getMe.mockResolvedValue({ data: ME });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
  });

  it('401 no se reintenta', async () => {
    h.identity.getMe.mockRejectedValue(httpError(401, 'Sesión inválida o expirada'));
    renderApp();
    await signIn();

    await screen.findByRole('alert');
    expect(h.identity.getMe).toHaveBeenCalledTimes(1);
  });

  it('un 503 posterior no vacía la cuenta ya cargada', async () => {
    renderApp();
    await signIn();
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('producer'));

    h.identity.getMe.mockRejectedValue(httpError(503));
    await userEvent.click(screen.getByRole('button', { name: 'Refrescar cuenta' }));

    await waitFor(() => expect(screen.getByTestId('me-error')).toHaveTextContent('No pudimos cargar tu cuenta.'));
    expect(screen.getByTestId('roles')).toHaveTextContent('producer');
    expect(screen.getByTestId('me')).toHaveTextContent('loaded');
    expect(screen.getByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
  });
});
