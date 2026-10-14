import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { navigateTo } from '@/components/public/publicRoutes';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { AuthPrompt } from '@/components/auth/AuthPrompt';
import { ROLE_LABELS } from '@/auth/roles';
import { errorDetail, identityApi, type AccountGameScore, type BusinessRole, type MeResponse } from '@/services/identity';
import type { Farm, ProductionOffer } from '@/services/api';
import '../styles/Account.css';

/** Pantalla /cuenta: perfil, roles, resultados y bloques según los roles activos. */
export function AccountPage() {
  const { status, user, me, roles, refreshMe } = useAuth();

  return (
    <div className="account-page">
      <header className="public-header account-header">
        <a
          className="public-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigateTo('/');
          }}
        >
          <span className="public-brand-name">RAÍCES CONECTADAS</span>
          <span className="public-brand-tag">Mi cuenta</span>
        </a>
        <AccountMenu />
      </header>

      <main className="account-main" aria-label="Mi cuenta">
        {status === 'loading' && <p className="auth-muted">Cargando tu cuenta…</p>}

        {status === 'anonymous' && (
          <AuthPrompt
            title="Mi cuenta"
            message="Inicia sesión para ver tu perfil, tus roles y tus resultados. El mapa, la información territorial y los juegos siguen disponibles sin cuenta."
          />
        )}

        {status === 'authenticated' && user && me && (
          <>
            <ProfileSection me={me} onSaved={refreshMe} />
            <RolesSection roles={roles} />
            <GameResultsSection />
            {roles.includes('producer') && <ProducerSection />}
            {roles.includes('buyer') && <BuyerPanel />}
          </>
        )}
      </main>
    </div>
  );
}

const DEPARTMENT_PATTERN = /^[0-9]{2}$/;
const MUNICIPALITY_PATTERN = /^[0-9]{5}$/;

function ProfileSection({ me, onSaved }: { me: MeResponse; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(me.profile.display_name);
  const [departmentCode, setDepartmentCode] = useState(me.profile.department_code ?? '');
  const [municipalityCode, setMunicipalityCode] = useState(me.profile.municipality_code ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (displayName.trim().length === 0) {
      setError('El nombre no puede estar vacío.');
      return;
    }
    if (departmentCode && !DEPARTMENT_PATTERN.test(departmentCode)) {
      setError('El código de departamento tiene 2 dígitos.');
      return;
    }
    if (municipalityCode && !MUNICIPALITY_PATTERN.test(municipalityCode)) {
      setError('El código de municipio tiene 5 dígitos.');
      return;
    }

    setSaving(true);
    try {
      await identityApi.updateMe({
        display_name: displayName.trim(),
        department_code: departmentCode || null,
        municipality_code: municipalityCode || null,
      });
      await onSaved();
      setMessage('Perfil guardado.');
    } catch (err) {
      setError(errorDetail(err, 'No pudimos guardar el perfil. Intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="account-profile-title">
      <h2 id="account-profile-title">Mi perfil</h2>
      <form className="account-form" onSubmit={handleSubmit} noValidate>
        <label>
          <span>Nombre</span>
          <input value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          <span>Código de departamento (DANE)</span>
          <input
            inputMode="numeric"
            maxLength={2}
            placeholder="76"
            value={departmentCode}
            onChange={(e) => setDepartmentCode(e.target.value.trim())}
          />
        </label>
        <label>
          <span>Código de municipio (DANE)</span>
          <input
            inputMode="numeric"
            maxLength={5}
            placeholder="76001"
            value={municipalityCode}
            onChange={(e) => setMunicipalityCode(e.target.value.trim())}
          />
        </label>
        <button type="submit" className="auth-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar perfil'}
        </button>
        {message && <p className="auth-notice" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

const ROLE_DESCRIPTIONS: Record<BusinessRole, string> = {
  producer: 'Registrar fincas, cultivos y ofertas.',
  buyer: 'Explorar ofertas y, próximamente, contactar productores.',
};

function RolesSection({ roles }: { roles: BusinessRole[] }) {
  const { setRoleActive } = useAuth();
  const [pendingRole, setPendingRole] = useState<BusinessRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(role: BusinessRole) {
    setError(null);
    setPendingRole(role);
    const result = await setRoleActive(role, !roles.includes(role));
    if (!result.ok) setError(result.message);
    setPendingRole(null);
  }

  return (
    <section className="account-section" aria-labelledby="account-roles-title">
      <h2 id="account-roles-title">Roles</h2>
      <p className="auth-muted">Una sola cuenta puede tener ambos roles. No necesitas crear otra.</p>
      <ul className="account-roles">
        {(['producer', 'buyer'] as BusinessRole[]).map((role) => {
          const active = roles.includes(role);
          return (
            <li key={role}>
              <div>
                <strong>{ROLE_LABELS[role]}</strong> <span className="auth-muted">{active ? 'Activo' : 'Inactivo'}</span>
                <p className="auth-muted">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
              <button
                type="button"
                className={active ? 'auth-secondary' : 'auth-primary'}
                disabled={pendingRole !== null}
                onClick={() => toggle(role)}
              >
                {active ? `Desactivar rol ${ROLE_LABELS[role].toLowerCase()}` : `Activar rol ${ROLE_LABELS[role].toLowerCase()}`}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  );
}

function GameResultsSection() {
  const [scores, setScores] = useState<AccountGameScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    identityApi
      .myGameScores()
      .then((response) => {
        if (!cancelled) setScores(response.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorDetail(err, 'No pudimos cargar tus resultados.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="account-section" aria-labelledby="account-results-title">
      <h2 id="account-results-title">Mis resultados</h2>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!error && scores === null && <p className="auth-muted">Cargando resultados…</p>}
      {scores && scores.length === 0 && (
        <p className="auth-muted">Aún no tienes partidas guardadas. Juega una partida y aparecerá aquí.</p>
      )}
      {scores && scores.length > 0 && (
        <table className="account-table">
          <thead>
            <tr>
              <th>Juego</th>
              <th>Puntaje</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((row) => (
              <tr key={row.id}>
                <td>{row.game_slug}{row.difficulty ? ` · ${row.difficulty}` : ''}</td>
                <td>{row.score}</td>
                <td>{new Date(row.created_at).toLocaleDateString('es-CO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ProducerSection() {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [offers, setOffers] = useState<ProductionOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([identityApi.myFarms(), identityApi.myOffers()])
      .then(([farmsResponse, offersResponse]) => {
        if (cancelled) return;
        setFarms(farmsResponse.data);
        setOffers(offersResponse.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorDetail(err, 'No pudimos cargar tu información productiva.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="account-section" aria-labelledby="account-farms-title">
        <h2 id="account-farms-title">Mis fincas</h2>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {farms && farms.length === 0 && (
          <p className="auth-muted">
            Aún no tienes fincas registradas. Regístralas desde la pestaña Gestión Productiva en el mapa.
          </p>
        )}
        {farms && farms.length > 0 && (
          <ul className="account-list">
            {farms.map((farm) => (
              <li key={farm.id}>
                <strong>{farm.name}</strong>
                <span className="auth-muted"> · {farm.municipality_code ?? 'sin municipio'}</span>
                {farm.active === false && <span className="auth-muted"> · inactiva</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="account-section" aria-labelledby="account-offers-title">
        <h2 id="account-offers-title">Mis cultivos y ofertas</h2>
        {offers && offers.length === 0 && <p className="auth-muted">Aún no tienes ofertas publicadas.</p>}
        {offers && offers.length > 0 && (
          <ul className="account-list">
            {offers.map((offer) => (
              <li key={offer.id}>
                {offer.available_quantity} {offer.unit} <span className="auth-muted">· {offer.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function BuyerPanel() {
  return (
    <section className="account-section" aria-labelledby="account-buyer-title">
      <h2 id="account-buyer-title">Panel comprador</h2>
      <div className="buyer-panel">
        <button type="button" className="auth-primary" onClick={() => navigateTo('/')}>
          Explorar ofertas
        </button>
        <button type="button" className="auth-secondary" disabled>
          Mis contactos (próximamente)
        </button>
      </div>
      <p className="auth-muted">
        El contacto con productores se habilitará en una fase posterior. Por ahora puedes explorar las ofertas visibles.
      </p>
    </section>
  );
}
