import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { AuthModal } from '../AuthModal';

function renderModal(overrides: Partial<AuthContextValue> = {}, props: Partial<Parameters<typeof AuthModal>[0]> = {}) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    signIn: vi.fn(async () => ({ ok: true as const })),
    signUp: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  const onClose = vi.fn();
  render(
    <AuthContext.Provider value={value}>
      <AuthModal open onClose={onClose} {...props} />
    </AuthContext.Provider>,
  );
  return { value, onClose };
}

describe('AuthModal - login', () => {
  it('shows the login form without name or role fields', () => {
    renderModal({}, { initialMode: 'login' });

    expect(screen.getByRole('dialog', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('sends the credentials and closes on success', async () => {
    const { value, onClose } = renderModal({}, { initialMode: 'login' });

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(value.signIn).toHaveBeenCalledWith('ana@example.com', 'clave-segura-123');
  });

  it('shows the message returned by the auth layer', async () => {
    renderModal(
      { signIn: vi.fn(async () => ({ ok: false as const, message: 'Correo o contraseña incorrectos.' })) },
      { initialMode: 'login' },
    );

    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mal');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });
});

describe('AuthModal - registro', () => {
  it('offers the three role choices and defaults to the requested one', () => {
    renderModal({}, { initialMode: 'signup', defaultChoice: 'producer' });

    expect(screen.getByRole('radio', { name: '🌾 Quiero vender' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '🛒 Quiero comprar' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '🌾🛒 Quiero comprar y vender' })).not.toBeChecked();
  });

  it('creates the account with producer and buyer roles when both is selected', async () => {
    const { value } = renderModal({}, { initialMode: 'signup' });

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana Pérez');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(screen.getByRole('radio', { name: '🌾🛒 Quiero comprar y vender' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() =>
      expect(value.signUp).toHaveBeenCalledWith({
        email: 'ana@example.com',
        password: 'clave-segura-123',
        displayName: 'Ana Pérez',
        choice: 'both',
      }),
    );
  });

  it('rejects a short password before calling the auth layer', async () => {
    const { value } = renderModal({}, { initialMode: 'signup' });

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    expect(value.signUp).not.toHaveBeenCalled();
  });

  it('explains when confirmation by email is required', async () => {
    renderModal(
      { signUp: vi.fn(async () => ({ ok: true as const, needsConfirmation: true })) },
      { initialMode: 'signup' },
    );

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Te enviamos un correo para confirmar');
  });

  it('switches between login and signup', async () => {
    renderModal({}, { initialMode: 'login' });

    await userEvent.click(screen.getByRole('button', { name: '¿No tienes cuenta? Créala' }));
    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();
  });
});

describe('AuthModal - without configured auth', () => {
  it('explains that accounts are unavailable and disables the submit button', () => {
    renderModal({ configured: false }, { initialMode: 'login' });

    expect(screen.getByRole('alert')).toHaveTextContent('Las cuentas no están disponibles');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  });
});
