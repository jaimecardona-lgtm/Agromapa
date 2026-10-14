import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { isAccountPath } from '@/auth/authRoutes';
import { PublicGamesApp } from '../public/PublicGamesApp';
import { isPublicGamesPath, parsePublicRoute } from '../public/publicRoutes';
import { OperationalManagement } from '../OperationalManagement';
import { PRODUCER_GATE_MESSAGE } from '../auth/ProducerGate';

const h = vi.hoisted(() => ({
  api: {
    operational: {
      currentOffers: { list: vi.fn(async () => ({ data: { count: 0, data: [] } })) },
      producers: { linkMine: vi.fn(async () => ({ data: { id: 'p-1', name: 'Finca Ana' } })) },
      farms: { listByProducer: vi.fn(async () => ({ data: [] })) },
      crops: { list: vi.fn(async () => ({ data: [] })) },
      offers: { list: vi.fn(async () => ({ data: [] })) },
    },
  },
}));

vi.mock('@/services/api', () => ({ api: h.api }));

function authWith(value: Partial<AuthContextValue>) {
  return { ...defaultAuthValue, configured: true, ...value };
}

describe('rutas públicas sin sesión', () => {
  it('keeps the portal and game routes public', () => {
    expect(isPublicGamesPath('/juegos')).toBe(true);
    expect(parsePublicRoute('/juegos/cosechas')).toEqual({ kind: 'game', slug: 'cosechas' });
  });

  it('recognises the account route without requiring it for navigation', () => {
    expect(isAccountPath('/cuenta')).toBe(true);
    expect(isAccountPath('/cuenta/')).toBe(true);
    expect(isAccountPath('/')).toBe(false);
  });

  it('renders the games portal for a guest with a login action in the header', () => {
    render(
      <AuthContext.Provider value={authWith({ status: 'anonymous' })}>
        <PublicGamesApp />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.getByText('RAÍCES CONECTADAS')).toBeInTheDocument();
  });
});

describe('Gestión productiva con y sin cuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the producer CTA to guests and never links a producer', async () => {
    render(
      <AuthContext.Provider value={authWith({ status: 'anonymous' })}>
        <OperationalManagement />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText(PRODUCER_GATE_MESSAGE)).toBeInTheDocument();
    expect(h.api.operational.producers.linkMine).not.toHaveBeenCalled();
  });

  it('blocks the farms tab for guests with the same CTA', async () => {
    render(
      <AuthContext.Provider value={authWith({ status: 'anonymous' })}>
        <OperationalManagement />
      </AuthContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fincas' }));
    expect(screen.getByText(PRODUCER_GATE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('links the account producer and loads its farms for producers', async () => {
    render(
      <AuthContext.Provider
        value={authWith({
          status: 'authenticated',
          user: { id: 'user-1', email: 'ana@example.com' },
          roles: ['producer'],
        })}
      >
        <OperationalManagement />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText(/Tu registro está vinculado a tu cuenta: Finca Ana/)).toBeInTheDocument();
    expect(h.api.operational.producers.linkMine).toHaveBeenCalledTimes(1);
    expect(h.api.operational.farms.listByProducer).toHaveBeenCalledWith('p-1');
    expect(screen.queryByText(PRODUCER_GATE_MESSAGE)).not.toBeInTheDocument();
  });
});
