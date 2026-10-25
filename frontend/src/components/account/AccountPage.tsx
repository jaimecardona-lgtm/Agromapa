import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RANKING_PATH, navigateTo } from '@/components/public/publicRoutes';
import { GAME_LABELS, rankingsApi, type MyRankingResponse } from '@/services/rankings';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { AuthPrompt } from '@/components/auth/AuthPrompt';
import { ROLE_LABELS } from '@/auth/roles';
import { errorDetail, identityApi, type AccountGameScore, type BusinessRole, type MeResponse } from '@/services/identity';
import { api, type Farm, type FarmCropDetail, type ProductionOffer } from '@/services/api';
import { conversationsApi, type ConversationSummary } from '@/services/conversations';
import { MARKETPLACE_PATH, MESSAGES_PATH, messagesPath } from '@/components/marketplace/marketplaceRoutes';
import '../styles/Account.css';

/** Pantalla /cuenta: perfil, roles, resultados y bloques según los roles activos. */
export function AccountPage() {
  const { status, user, me, meError, roles, refreshMe } = useAuth();

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

        {status === 'authenticated' && user && !me && (
          <AccountLoadState error={meError} onRetry={refreshMe} />
        )}

        {status === 'authenticated' && user && me && (
          <>
            <ProfileSection me={me} onSaved={refreshMe} />
            <RolesSection roles={roles} />
            <ProgressSection />
            <GameResultsSection />
            {roles.includes('producer') && <ProducerSection />}
            {roles.includes('buyer') && <BuyerPanel />}
          </>
        )}
      </main>
    </div>
  );
}

/** Estado mientras carga /api/me o si falló: nunca una pantalla vacía. */
function AccountLoadState({ error, onRetry }: { error: string | null; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);

  if (!error) {
    return <p className="auth-muted">Restaurando tu sesión…</p>;
  }

  async function handleRetry() {
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  }

  return (
    <section className="auth-prompt" aria-label="No pudimos cargar tu cuenta">
      <h3>No pudimos cargar tu cuenta.</h3>
      <p role="alert">{error}</p>
      <button type="button" className="auth-primary" disabled={retrying} onClick={handleRetry}>
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </section>
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
  buyer: 'Explorar ofertas y escribir a productores desde cada oferta.',
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
  const [crops, setCrops] = useState<FarmCropDetail[] | null>(null);
  const [cropsError, setCropsError] = useState<string | null>(null);
  const [offers, setOffers] = useState<ProductionOffer[] | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [farmsResponse, offersResponse, conversationsResponse] = await Promise.all([
          identityApi.myFarms(),
          identityApi.myOffers(),
          conversationsApi.list(),
        ]);
        if (cancelled) return;
        setFarms(farmsResponse.data);
        setOffers(offersResponse.data);
        setConversations(conversationsResponse.data.filter((item) => item.my_role === 'producer'));

        // Cultivos por finca; una finca que falla no oculta las demás, pero su fallo se muestra.
        const cropResults = await Promise.all(
          farmsResponse.data.map((farm) =>
            api.operational.crops.list(farm.id).then(
              (response) => ({ farm, crops: response.data as FarmCropDetail[], failed: false }),
              () => ({ farm, crops: [] as FarmCropDetail[], failed: true }),
            ),
          ),
        );
        if (cancelled) return;
        const failedFarms = cropResults.filter((result) => result.failed).map((result) => result.farm.name);
        setCrops(cropResults.flatMap((result) => result.crops));
        setCropsError(
          failedFarms.length > 0 ? `No pudimos cargar los cultivos de ${failedFarms.join(', ')}.` : null,
        );
      } catch (err) {
        if (!cancelled) setError(errorDetail(err, 'No pudimos cargar tu información productiva.'));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Indicadores calculados con los datos cargados; sin cifras inventadas.
  const activeFarms = farms?.filter((farm) => farm.active !== false).length ?? 0;
  const availableOffers = offers?.filter((offer) => offer.status === 'available').length ?? 0;
  const openConversations = conversations?.filter((item) => item.status === 'active').length ?? 0;

  return (
    <section className="account-section" aria-labelledby="account-producer-title">
      <h2 id="account-producer-title">Mi actividad productiva</h2>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <dl className="account-indicators">
        <div>
          <dt>Fincas activas</dt>
          <dd>{farms ? activeFarms : '—'}</dd>
        </div>
        <div>
          <dt>Ofertas disponibles</dt>
          <dd>{offers ? availableOffers : '—'}</dd>
        </div>
        <div>
          <dt>Conversaciones abiertas</dt>
          <dd>{conversations ? openConversations : '—'}</dd>
        </div>
      </dl>

      <h3>Mis fincas</h3>
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

      <h3>Mis cultivos</h3>
      {cropsError && (
        <p className="auth-error" role="alert">
          {cropsError}
        </p>
      )}
      {crops && crops.length === 0 && !cropsError && <p className="auth-muted">Aún no tienes cultivos registrados.</p>}
      {crops && crops.length > 0 && (
        <ul className="account-list">
          {crops.map((crop) => (
            <li key={crop.id}>
              <strong>{crop.crop_name}</strong>
              {crop.area_hectares != null && <span className="auth-muted"> · {crop.area_hectares} ha</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>Mis ofertas</h3>
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

      <h3>Mensajes recibidos</h3>
      {conversations && conversations.length === 0 && (
        <p className="auth-muted">Aún no has recibido mensajes de compradores.</p>
      )}
      {conversations && conversations.length > 0 && (
        <ul className="account-list">
          {conversations.map((item) => (
            <li key={item.id}>
              <button type="button" className="account-link" onClick={() => navigateTo(messagesPath(item.id))}>
                {item.counterpart_name}
                {item.offer ? ` · ${item.offer.crop_name}` : ''}
              </button>
              {item.unread_count > 0 && <span className="unread-badge">{item.unread_count} sin leer</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BuyerPanel() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    conversationsApi
      .list()
      .then((response) => {
        if (!cancelled) setConversations(response.data.filter((item) => item.my_role === 'buyer'));
      })
      .catch((err) => {
        if (!cancelled) setError(errorDetail(err, 'No pudimos cargar tus conversaciones.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="account-section" aria-labelledby="account-buyer-title">
      <h2 id="account-buyer-title">Panel comprador</h2>
      <div className="buyer-panel">
        <button type="button" className="auth-primary" onClick={() => navigateTo(MARKETPLACE_PATH)}>
          Explorar mercado
        </button>
        <button type="button" className="auth-secondary" onClick={() => navigateTo(MESSAGES_PATH)}>
          Mis conversaciones
        </button>
      </div>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {conversations && conversations.length === 0 && (
        <p className="auth-muted">Aún no has contactado productores. Abre una oferta del mercado para escribirle.</p>
      )}
      {conversations && conversations.length > 0 && (
        <>
          <h3>Contactos recientes</h3>
          <ul className="account-list">
            {conversations.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" className="account-link" onClick={() => navigateTo(messagesPath(item.id))}>
                  {item.counterpart_name}
                  {item.offer ? ` · ${item.offer.crop_name}` : ''}
                </button>
                {item.unread_count > 0 && <span className="unread-badge">{item.unread_count} sin leer</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Mi progreso y Mis posiciones: datos reales del ranking. Sin cifras inventadas. */
function ProgressSection() {
  const [mine, setMine] = useState<MyRankingResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    rankingsApi
      .me()
      .then((res) => {
        if (!cancelled) {
          setMine(res.data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="account-section" aria-labelledby="account-progress-title">
      <h2 id="account-progress-title">Mi progreso</h2>
      {state === 'loading' && <p className="auth-muted">Cargando tu progreso…</p>}
      {state === 'error' && (
        <p className="auth-error" role="alert">
          No pudimos cargar tu progreso.
        </p>
      )}
      {state === 'ready' && mine && (
        <>
          {!mine.has_scores && <p className="auth-muted">Juega una partida para aparecer en el ranking.</p>}
          <ul className="account-list" aria-label="Mejores puntajes">
            {(['cosechas', 'eco-puzzle', 'cazadores-residuos'] as const).map((slug) => (
              <li key={slug}>
                <strong>{GAME_LABELS[slug]}</strong>: {mine.best[slug] ?? 'sin partidas'}
              </li>
            ))}
            <li>
              <strong>Puntaje general</strong>: {mine.general ?? 'sin partidas'}
            </li>
          </ul>

          <h3>Mis posiciones</h3>
          <p className="auth-muted">Posiciones del ranking general.</p>
          <ul className="account-list" aria-label="Mis posiciones">
            <li>
              Municipio:{' '}
              {mine.positions.municipality
                ? `#${mine.positions.municipality.rank} de ${mine.positions.municipality.of}`
                : mine.missing_territory.includes('municipality')
                  ? 'Completa tu municipio en Mi cuenta para participar en el ranking municipal.'
                  : 'Sin posición todavía'}
            </li>
            <li>
              Departamento:{' '}
              {mine.positions.department
                ? `#${mine.positions.department.rank} de ${mine.positions.department.of}`
                : mine.missing_territory.includes('department')
                  ? 'Completa tu departamento en Mi cuenta para participar en el ranking departamental.'
                  : 'Sin posición todavía'}
            </li>
            <li>
              Colombia: {mine.positions.national ? `#${mine.positions.national.rank} de ${mine.positions.national.of}` : 'Sin posición todavía'}
            </li>
          </ul>
        </>
      )}
      <button type="button" className="auth-secondary" onClick={() => navigateTo(RANKING_PATH)}>
        Ver ranking
      </button>
    </section>
  );
}
