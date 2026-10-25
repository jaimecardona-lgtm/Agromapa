import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext';
import { postSignupPath, takeReturnPath } from '@/auth/authRoutes';
import { type RoleChoice } from '@/auth/roles';
import { navigateTo } from '@/components/public/publicRoutes';
import { RoleSelector } from './RoleSelector';
import '../styles/Auth.css';

type Mode = 'login' | 'signup';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  defaultChoice?: RoleChoice;
  /** Explica por qué se pide la cuenta (p. ej. registrar una finca). */
  message?: string;
  onAuthenticated?: () => void;
  /**
   * Tras entrar o registrarse, lleva a la ruta de regreso o al panel del rol
   * (comprador -> /mercado; resto -> /cuenta). Solo lo activan flujos de negocio.
   */
  redirectAfterAuth?: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

export function AuthModal({
  open,
  onClose,
  initialMode = 'login',
  defaultChoice = 'producer',
  message,
  onAuthenticated,
  redirectAfterAuth = false,
}: AuthModalProps) {
  const { configured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [choice, setChoice] = useState<RoleChoice>(defaultChoice);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleId = useId();

  // Cada apertura empieza limpia, con el modo y la elección pedidos.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setChoice(defaultChoice);
    setError(null);
    setNotice(null);
    setPassword('');
  }, [open, initialMode, defaultChoice]);

  // Mientras el modal está abierto la página no se desplaza por debajo. Se restaura al cerrar o desmontar.
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const isSignup = mode === 'signup';
  const title = isSignup ? 'Crear cuenta' : 'Iniciar sesión';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!configured) {
      setError('Las cuentas no están disponibles en este entorno.');
      return;
    }
    if (isSignup && displayName.trim().length === 0) {
      setError('Escribe el nombre que verán otros usuarios.');
      return;
    }
    if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = isSignup
        ? await signUp({ email, password, displayName, choice })
        : await signIn(email, password);

      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.needsConfirmation) {
        setNotice('Te enviamos un correo para confirmar tu cuenta. Después podrás iniciar sesión.');
        return;
      }
      if (redirectAfterAuth) {
        const destination = isSignup ? postSignupPath(choice) : takeReturnPath();
        const current = `${window.location.pathname}${window.location.search}`;
        if (destination && destination !== current) navigateTo(destination);
      }
      onAuthenticated?.();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  // Portal a document.body: el modal no hereda el contexto de apilamiento del header
  // (z-index 10) ni de la app, y así queda por encima de Leaflet y del resto de la página.
  return createPortal(
    <div className="auth-backdrop" onClick={onClose}>
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="auth-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
        {message && <p className="auth-message">{message}</p>}
        {!configured && (
          <p className="auth-error" role="alert">
            Las cuentas no están disponibles en este entorno.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {isSignup && (
            <label className="auth-field">
              <span>Nombre</span>
              <input
                type="text"
                name="display_name"
                autoComplete="name"
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          <label className="auth-field">
            <span>Correo electrónico</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Contraseña</span>
            <input
              type="password"
              name="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {isSignup && <RoleSelector value={choice} onChange={setChoice} disabled={submitting} />}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={submitting || !configured}>
            {submitting ? 'Procesando…' : title}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(isSignup ? 'login' : 'signup');
            setError(null);
            setNotice(null);
          }}
        >
          {isSignup ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Créala'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
