import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { AccountMenu } from '../AccountMenu';
import { ProducerGate, PRODUCER_GATE_MESSAGE } from '../ProducerGate';

function withAuth(value: Partial<AuthContextValue>, children: ReactNode) {
  return <AuthContext.Provider value={{ ...defaultAuthValue, configured: true, ...value }}>{children}</AuthContext.Provider>;
}

const AUTHENTICATED = {
  status: 'authenticated' as const,
  user: { id: 'user-1', email: 'ana@example.com' },
  me: {
    id: 'user-1',
    email: 'ana@example.com',
    profile: {
      id: 'user-1',
      display_name: 'Ana',
      country_code: 'CO',
      department_code: null,
      municipality_code: null,
      avatar_url: null,
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
    },
    roles: ['producer' as const],
    producer_profile: null,
    buyer_profile: null,
  },
  roles: ['producer' as const],
};

describe('AccountMenu', () => {
  it('shows Iniciar sesión to guests and opens the login dialog', async () => {
    render(withAuth({ status: 'anonymous' }, <AccountMenu />));

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByRole('dialog', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('shows the initial, name, Mi cuenta and Cerrar sesión when authenticated', async () => {
    const signOut = vi.fn(async () => undefined);
    render(withAuth({ ...AUTHENTICATED, signOut }, <AccountMenu />));

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mi cuenta' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('renders nothing while the session is loading', () => {
    const { container } = render(withAuth({ status: 'loading' }, <AccountMenu />));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProducerGate (CTA finca)', () => {
  it('asks guests for an account and hides the productive form', () => {
    render(
      withAuth(
        { status: 'anonymous' },
        <ProducerGate>
          <p>formulario de finca</p>
        </ProducerGate>,
      ),
    );

    expect(screen.getByText(PRODUCER_GATE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByText('formulario de finca')).not.toBeInTheDocument();
  });

  it('offers to activate the producer role without creating a second account', async () => {
    const setRoleActive = vi.fn(async () => ({ ok: true as const }));
    render(
      withAuth(
        { ...AUTHENTICATED, roles: ['buyer'], setRoleActive },
        <ProducerGate>
          <p>formulario de finca</p>
        </ProducerGate>,
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Activar rol productor' }));
    expect(setRoleActive).toHaveBeenCalledWith('producer', true);
    expect(screen.queryByText('formulario de finca')).not.toBeInTheDocument();
  });

  it('renders the productive form for producers', () => {
    render(
      withAuth(
        AUTHENTICATED,
        <ProducerGate>
          <p>formulario de finca</p>
        </ProducerGate>,
      ),
    );
    expect(screen.getByText('formulario de finca')).toBeInTheDocument();
  });
});
