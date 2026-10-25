import { useState } from 'react';
import type { RoleChoice } from '@/auth/roles';
import { AuthModal } from './AuthModal';
import '../styles/Auth.css';

interface AuthPromptProps {
  message: string;
  title?: string;
  defaultChoice?: RoleChoice;
  /** Si se envía, aparece "Seguir como invitado" para cerrar el aviso sin registrarse. */
  onGuest?: () => void;
  guestLabel?: string;
  onAuthenticated?: () => void;
  redirectAfterAuth?: boolean;
}

/** Aviso con [Crear cuenta] [Iniciar sesión]. No bloquea la navegación. */
export function AuthPrompt({
  message,
  title,
  defaultChoice = 'producer',
  onGuest,
  guestLabel = 'Seguir como invitado',
  onAuthenticated,
  redirectAfterAuth = false,
}: AuthPromptProps) {
  const [modal, setModal] = useState<{ open: boolean; mode: 'login' | 'signup' }>({
    open: false,
    mode: 'login',
  });

  return (
    <section className="auth-prompt" aria-label={title ?? 'Cuenta requerida'}>
      {title && <h3>{title}</h3>}
      <p>{message}</p>
      <div className="auth-prompt-actions">
        <button type="button" className="auth-primary" onClick={() => setModal({ open: true, mode: 'signup' })}>
          Crear cuenta
        </button>
        <button type="button" className="auth-secondary" onClick={() => setModal({ open: true, mode: 'login' })}>
          Iniciar sesión
        </button>
        {onGuest && (
          <button type="button" className="auth-link" onClick={onGuest}>
            {guestLabel}
          </button>
        )}
      </div>
      <AuthModal
        open={modal.open}
        initialMode={modal.mode}
        defaultChoice={defaultChoice}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
        onAuthenticated={onAuthenticated}
        redirectAfterAuth={redirectAfterAuth}
      />
    </section>
  );
}
