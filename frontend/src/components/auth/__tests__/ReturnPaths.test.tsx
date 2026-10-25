import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { PRODUCTIVE_RETURN_PATH, isProductiveViewRequested } from '@/auth/authRoutes';
import { ProducerGate, PRODUCER_GATE_MESSAGE } from '../ProducerGate';

function renderGate(overrides: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    signIn: vi.fn(async () => ({ ok: true as const })),
    signUp: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={value}>
      <ProducerGate>
        <p>Formulario productivo</p>
      </ProducerGate>
    </AuthContext.Provider>,
  );
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('Registrar finca: retorno a la gestión productiva', () => {
  it('identifica la vista de gestión por query y no confunde otras rutas', () => {
    expect(isProductiveViewRequested('?vista=gestion')).toBe(true);
    expect(isProductiveViewRequested('?department=76&vista=gestion')).toBe(true);
    expect(isProductiveViewRequested('?vista=otra')).toBe(false);
    expect(isProductiveViewRequested('')).toBe(false);
  });

  it('anónimo: al crear cuenta productor vuelve a la gestión, no a /cuenta', async () => {
    const value = renderGate({ status: 'anonymous' });

    expect(screen.getByText(PRODUCER_GATE_MESSAGE)).toBeInTheDocument();
    expect(window.sessionStorage.getItem('raices-return-path')).toBe(PRODUCTIVE_RETURN_PATH);

    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Ana');
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(within(dialog).getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(value.signUp).toHaveBeenCalledWith(expect.objectContaining({ choice: 'producer' })));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(PRODUCTIVE_RETURN_PATH));
    expect(window.location.pathname).not.toBe('/cuenta');
    expect(window.sessionStorage.getItem('raices-return-path')).toBeNull();
  });

  it('anónimo que inicia sesión con cuenta productora vuelve a la gestión', async () => {
    renderGate({ status: 'anonymous' });

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(within(dialog).getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(PRODUCTIVE_RETURN_PATH));
  });

  it('con sesión y rol productor muestra el formulario, sin aviso ni redirección', () => {
    renderGate({ status: 'authenticated', roles: ['producer'] });

    expect(screen.getByText('Formulario productivo')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.sessionStorage.getItem('raices-return-path')).toBeNull();
  });
});
