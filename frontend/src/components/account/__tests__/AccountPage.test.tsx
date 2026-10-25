import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { BusinessRole, MeResponse } from '@/services/identity';
import { AccountPage } from '../AccountPage';

const h = vi.hoisted(() => ({
  identity: {
    myGameScores: vi.fn(),
    myFarms: vi.fn(),
    myOffers: vi.fn(),
    updateMe: vi.fn(),
  },
  conversations: {
    list: vi.fn(),
  },
  api: {
    operational: {
      crops: { list: vi.fn() },
    },
  },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: h.api };
});

vi.mock('@/services/conversations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/conversations')>();
  return { ...actual, conversationsApi: h.conversations };
});

vi.mock('@/services/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/identity')>();
  return { ...actual, identityApi: h.identity };
});


const rankingMe = vi.hoisted(() => ({
  me: vi.fn(async () => ({
    data: {
      has_scores: false,
      best: {},
      general: null,
      territory: { department_code: null, department_name: null, municipality_code: null, municipality_name: null },
      positions: { national: null, department: null, municipality: null },
      missing_territory: ['department', 'municipality'],
    },
  })),
}));

vi.mock('@/services/rankings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/rankings')>();
  return { ...actual, rankingsApi: { get: vi.fn(), me: rankingMe.me } };
});

function meFor(roles: BusinessRole[]): MeResponse {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    profile: {
      id: 'user-1',
      display_name: 'Ana',
      country_code: 'CO',
      department_code: '76',
      municipality_code: '76001',
      avatar_url: null,
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
    },
    roles,
    producer_profile: null,
    buyer_profile: null,
  };
}

function renderAccount(overrides: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'ana@example.com' },
    me: meFor(overrides.roles ?? []),
    roles: [],
    setRoleActive: vi.fn(async () => ({ ok: true as const })),
    refreshMe: vi.fn(async () => undefined),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={value}>
      <AccountPage />
    </AuthContext.Provider>,
  );
  return value;
}

describe('AccountPage (/cuenta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.identity.myGameScores.mockResolvedValue({ data: [] });
    h.identity.myFarms.mockResolvedValue({ data: [] });
    h.identity.myOffers.mockResolvedValue({ data: [] });
    h.conversations.list.mockResolvedValue({ data: [] });
    h.api.operational.crops.list.mockResolvedValue({ data: [] });
  });

  it('asks guests to sign in and does not load account data', () => {
    renderAccount({ status: 'anonymous', user: null, me: null });

    expect(screen.getByRole('region', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(h.identity.myGameScores).not.toHaveBeenCalled();
  });

  it('con sesión pero sin /api/me muestra "Cargando", nunca una pantalla vacía', () => {
    renderAccount({ me: null, meError: null, roles: [] });

    expect(screen.getByText('Restaurando tu sesión…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mi perfil' })).not.toBeInTheDocument();
  });

  it('si /api/me falla muestra el motivo y permite reintentar', async () => {
    const refreshMe = vi.fn(async () => undefined);
    renderAccount({
      me: null,
      meError: 'El servicio de autenticación no está disponible en este momento.',
      refreshMe,
    });

    expect(screen.getByRole('heading', { name: 'No pudimos cargar tu cuenta.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('El servicio de autenticación no está disponible');

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refreshMe).toHaveBeenCalledTimes(1);
  });

  it('con /api/me correcto renderiza el contenido real de la cuenta', () => {
    renderAccount({ roles: ['buyer'], meError: null });

    expect(screen.getByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar tu cuenta.')).not.toBeInTheDocument();
  });

  it('shows profile, roles and results for any account', async () => {
    renderAccount({ roles: ['buyer'] });

    expect(screen.getByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Roles' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no tienes partidas guardadas. Juega una partida y aparecerá aquí.')).toBeInTheDocument();
  });

  it('shows only the buyer panel for a buyer-only account', async () => {
    renderAccount({ roles: ['buyer'] });

    expect(screen.getByRole('heading', { name: 'Panel comprador' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis fincas' })).not.toBeInTheDocument();
    expect(h.identity.myFarms).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Explorar mercado' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Mis conversaciones' })).toBeEnabled();
    expect(screen.queryByText(/próximamente/)).not.toBeInTheDocument();
  });

  it('shows producer blocks only for producers', async () => {
    renderAccount({ roles: ['producer'] });

    expect(await screen.findByRole('heading', { name: 'Mis fincas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mi actividad productiva' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis cultivos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis ofertas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mensajes recibidos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Panel comprador' })).not.toBeInTheDocument();
  });

  it('shows both blocks when the account has producer and buyer roles', async () => {
    renderAccount({ roles: ['producer', 'buyer'] });

    expect(await screen.findByRole('heading', { name: 'Mis fincas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Panel comprador' })).toBeInTheDocument();
  });

  it('toggles a role through the auth layer without creating another account', async () => {
    const value = renderAccount({ roles: ['producer'] });

    await userEvent.click(screen.getByRole('button', { name: 'Activar rol comprador' }));
    expect(value.setRoleActive).toHaveBeenCalledWith('buyer', true);

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar rol productor' }));
    expect(value.setRoleActive).toHaveBeenCalledWith('producer', false);
  });
});
