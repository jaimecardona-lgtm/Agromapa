import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { ACCOUNT_PATH } from '@/auth/authRoutes';
import { navigateTo } from '@/components/public/publicRoutes';
import { AuthModal } from './AuthModal';
import '../styles/Auth.css';

/** Acción de cuenta para cabeceras públicas: invitado -> Iniciar sesión; autenticado -> avatar, Mi cuenta, Cerrar sesión. */
export function AccountMenu() {
  const { status, user, me, signOut } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  if (status === 'loading') return null;

  if (status !== 'authenticated' || !user) {
    return (
      <>
        <button type="button" className="account-menu-login" onClick={() => setLoginOpen(true)}>
          Iniciar sesión
        </button>
        <AuthModal open={loginOpen} onClose={() => setLoginOpen(false)} initialMode="login" />
      </>
    );
  }

  const name = me?.profile.display_name ?? user.email ?? 'Mi cuenta';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="account-menu" aria-label="Cuenta">
      <span className="account-avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="account-name">{name}</span>
      <button
        type="button"
        className="account-menu-link"
        onClick={() => navigateTo(ACCOUNT_PATH)}
      >
        Mi cuenta
      </button>
      <button type="button" className="account-menu-link" onClick={() => void signOut()}>
        Cerrar sesión
      </button>
    </div>
  );
}
