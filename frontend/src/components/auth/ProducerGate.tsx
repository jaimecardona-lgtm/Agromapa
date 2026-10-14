import { useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { AuthPrompt } from './AuthPrompt';
import '../styles/Auth.css';

export const PRODUCER_GATE_MESSAGE =
  'Para registrar y administrar información productiva necesitas una cuenta de productor.';

/**
 * Sustituye los formularios productivos cuando falta sesión o el rol productor.
 * Con sesión y sin rol, ofrece activarlo sin crear una segunda cuenta.
 */
export function ProducerGate({ children }: { children: ReactNode }) {
  const { status, roles, setRoleActive } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') {
    return <p className="auth-muted">Cargando tu cuenta…</p>;
  }

  if (status !== 'authenticated') {
    return <AuthPrompt message={PRODUCER_GATE_MESSAGE} defaultChoice="producer" />;
  }

  if (!roles.includes('producer')) {
    return (
      <section className="auth-prompt" aria-label="Activar rol productor">
        <p>{PRODUCER_GATE_MESSAGE}</p>
        <p className="auth-muted">Tu cuenta no tiene el rol productor todavía. Puedes activarlo ahora.</p>
        <button
          type="button"
          className="auth-primary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await setRoleActive('producer', true);
            if (!result.ok) setError(result.message);
            setPending(false);
          }}
        >
          {pending ? 'Activando…' : 'Activar rol productor'}
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return <>{children}</>;
}
