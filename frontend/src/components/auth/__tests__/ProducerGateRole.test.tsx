import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { MeResponse } from '@/services/identity';
import { ProducerGate } from '../ProducerGate';

const ME = {
  id: 'user-1',
  email: 'productor@example.com',
  profile: { id: 'user-1', display_name: 'Jaime Cardona' },
  roles: ['producer'],
  producer_profile: null,
  buyer_profile: null,
} as unknown as MeResponse;

function renderGate(overrides: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    roles: [],
    me: null,
    meError: null,
    refreshMe: vi.fn(async () => undefined),
    setRoleActive: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={value}>
      <ProducerGate>
        <p>CONTENIDO PRODUCTIVO</p>
      </ProducerGate>
    </AuthContext.Provider>,
  );
  return value;
}

describe('ProducerGate: rol productor con estado real de /api/me', () => {
  it('sesión sin /api/me todavía: NO ofrece activar el rol', () => {
    renderGate({ me: null, meError: null, roles: [] });

    expect(screen.getByText('Restaurando tu sesión…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar rol productor' })).not.toBeInTheDocument();
    expect(screen.queryByText(/no tiene el rol productor/)).not.toBeInTheDocument();
  });

  it('/api/me falló: muestra el error con Reintentar, NO "Activar rol productor"', async () => {
    const refreshMe = vi.fn(async () => undefined);
    renderGate({ me: null, meError: 'El servicio de autenticación no está disponible.', refreshMe });

    expect(screen.getByRole('alert')).toHaveTextContent('El servicio de autenticación no está disponible.');
    expect(screen.queryByRole('button', { name: 'Activar rol productor' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refreshMe).toHaveBeenCalledTimes(1);
  });

  it('/api/me cargado sin rol productor: sí ofrece activarlo', () => {
    renderGate({ me: { ...ME, roles: [] } as MeResponse, roles: [] });

    expect(screen.getByRole('button', { name: 'Activar rol productor' })).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO PRODUCTIVO')).not.toBeInTheDocument();
  });

  it('rol producer activo en /api/me: muestra el contenido sin pedir activación', () => {
    renderGate({ me: ME, roles: ['producer'] });

    expect(screen.getByText('CONTENIDO PRODUCTIVO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar rol productor' })).not.toBeInTheDocument();
  });
});
