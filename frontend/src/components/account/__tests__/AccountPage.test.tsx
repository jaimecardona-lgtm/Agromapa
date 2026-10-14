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
}));

vi.mock('@/services/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/identity')>();
  return { ...actual, identityApi: h.identity };
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
  });

  it('asks guests to sign in and does not load account data', () => {
    renderAccount({ status: 'anonymous', user: null, me: null });

    expect(screen.getByRole('region', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(h.identity.myGameScores).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'Mis contactos (próximamente)' })).toBeDisabled();
  });

  it('shows producer blocks only for producers', async () => {
    renderAccount({ roles: ['producer'] });

    expect(await screen.findByRole('heading', { name: 'Mis fincas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis cultivos y ofertas' })).toBeInTheDocument();
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
