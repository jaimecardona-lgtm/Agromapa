import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { rememberReturnPath } from '@/auth/authRoutes';
import { api, type CurrentOffer } from '@/services/api';
import { conversationsApi } from '@/services/conversations';
import { errorDetail } from '@/services/identity';
import { navigateTo } from '@/components/public/publicRoutes';
import { AuthPrompt } from '@/components/auth/AuthPrompt';
import { PublicShell } from './PublicShell';
import { MARKETPLACE_PATH, messagesPath, offerPath } from './marketplaceRoutes';
import { formatDateOnly, formatPrice } from './formatters';
import { formatQuantity, unitLabel } from '@/utils/units';
import { producerPath } from './producerRoutes';
import { CropImage, IllustrationDisclaimer } from '../operational/CropImage';

export const ANONYMOUS_CONTACT_MESSAGE =
  'Para contactar y negociar con un productor debes iniciar sesión como comprador.';
export const ACTIVATE_BUYER_MESSAGE = 'Activa el rol comprador para contactar productores.';
export const NO_MESSAGING_MESSAGE = 'Este productor aún no tiene una cuenta vinculada para mensajería interna.';

interface OfferDetailPageProps {
  offerId: string;
}

export function OfferDetailPage({ offerId }: OfferDetailPageProps) {
  const [offer, setOffer] = useState<CurrentOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOffer(null);
    setLoadError(null);
    api.operational.currentOffers
      .get(offerId)
      .then((res) => {
        if (!cancelled) setOffer(res.data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorDetail(err, 'Esta oferta ya no está disponible.'));
      });
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  return (
    <PublicShell tag="Oferta">
      <nav className="market-back">
        <a
          href={MARKETPLACE_PATH}
          onClick={(event) => {
            event.preventDefault();
            navigateTo(MARKETPLACE_PATH);
          }}
        >
          ← Volver al mercado
        </a>
      </nav>

      {loadError && (
        <p className="auth-error" role="alert">
          {loadError}
        </p>
      )}
      {!offer && !loadError && <p className="auth-muted">Cargando oferta…</p>}
      {offer && <OfferDetail offer={offer} />}
    </PublicShell>
  );
}

function OfferDetail({ offer }: { offer: CurrentOffer }) {
  const price = formatPrice(offer.price_per_unit, offer.unit);
  const from = formatDateOnly(offer.available_from);
  const until = formatDateOnly(offer.available_until);
  const contact = offer.producer_contact;

  return (
    <article className="offer-detail" aria-labelledby="offer-title">
      <CropImage src={offer.crop_image_url} cropName={offer.crop_name} variant="hero" />
      {offer.crop_image_url && <IllustrationDisclaimer />}
      <header>
        <h1 id="offer-title">{offer.crop_name}</h1>
        <p className="market-quantity">
          {formatQuantity(offer.quantity, offer.unit)}
          {price && <span className="offer-price"> · {price}</span>}
        </p>
      </header>

      <section className="account-section" aria-labelledby="offer-data-title">
        <h2 id="offer-data-title">Oferta</h2>
        <dl className="market-meta">
          <div>
            <dt>Cantidad disponible</dt>
            <dd>{formatQuantity(offer.quantity, offer.unit)}</dd>
          </div>
          <div>
            <dt>Precio por unidad</dt>
            <dd>{price ?? 'No indicado'}</dd>
          </div>
          <div>
            <dt>Unidad de venta</dt>
            <dd>{unitLabel(offer.unit)}</dd>
          </div>
          <div>
            <dt>Disponibilidad</dt>
            <dd>{from || until ? `${from ?? 'Desde hoy'} – ${until ?? 'sin fecha final'}` : 'Vigente'}</dd>
          </div>
          {offer.description && (
            <div>
              <dt>Descripción</dt>
              <dd>{offer.description}</dd>
            </div>
          )}
          {offer.notes && (
            <div>
              <dt>Notas</dt>
              <dd>{offer.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="account-section" aria-labelledby="offer-place-title">
        <h2 id="offer-place-title">Finca y territorio</h2>
        <dl className="market-meta">
          <div>
            <dt>Finca</dt>
            <dd>{offer.farm_name}</dd>
          </div>
          <div>
            <dt>Municipio</dt>
            <dd>{offer.municipality_name}</dd>
          </div>
        </dl>
      </section>

      <section className="account-section" aria-labelledby="offer-producer-title">
        <h2 id="offer-producer-title">Productor</h2>
        <p>
          <strong>{offer.producer_name}</strong>
          {offer.producer_verified && <span className="market-badge">Verificado</span>}
        </p>
        {offer.producer_id && (
          <button type="button" className="market-action" onClick={() => navigateTo(producerPath(offer.producer_id!))}>
            Ver perfil del productor
          </button>
        )}
        {contact && (
          <ul className="offer-contact" aria-label="Contacto público del productor">
            {contact.public_phone && <li>Teléfono: {contact.public_phone}</li>}
            {contact.whatsapp && <li>WhatsApp: {contact.whatsapp}</li>}
            {contact.public_email && <li>Correo: {contact.public_email}</li>}
          </ul>
        )}
      </section>

      <section className="account-section offer-cta" aria-labelledby="offer-cta-title">
        <h2 id="offer-cta-title">Contactar al productor</h2>
        <ContactAction offer={offer} />
      </section>
    </article>
  );
}

/** Decide qué acción ofrecer: login, activar comprador, iniciar conversación o aviso de mensajería. */
function ContactAction({ offer }: { offer: CurrentOffer }) {
  const { configured, status, roles, setRoleActive } = useAuth();
  const [starting, setStarting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerRoute = offerPath(offer.id);
  const needsLogin = !configured || status === 'anonymous';

  // Si el usuario entra o se registra desde aquí, volverá a esta oferta.
  useEffect(() => {
    if (needsLogin) rememberReturnPath(offerRoute);
  }, [needsLogin, offerRoute]);

  if (!offer.messaging_available) {
    return (
      <p role="status" className="auth-notice">
        {NO_MESSAGING_MESSAGE}
      </p>
    );
  }

  if (needsLogin) {
    return <AuthPrompt message={ANONYMOUS_CONTACT_MESSAGE} defaultChoice="buyer" redirectAfterAuth />;
  }

  if (status === 'loading') {
    return <p className="auth-muted">Cargando tu cuenta…</p>;
  }

  if (!roles.includes('buyer')) {
    return (
      <div>
        <p>{ACTIVATE_BUYER_MESSAGE}</p>
        <button
          type="button"
          className="auth-primary"
          disabled={activating}
          onClick={async () => {
            setActivating(true);
            setError(null);
            const result = await setRoleActive('buyer', true);
            if (!result.ok) setError(result.message);
            setActivating(false);
          }}
        >
          {activating ? 'Activando…' : 'Activar rol comprador'}
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="auth-primary"
        disabled={starting}
        onClick={async () => {
          setStarting(true);
          setError(null);
          try {
            const response = await conversationsApi.create(offer.id);
            navigateTo(messagesPath(response.data.id));
          } catch (err) {
            setError(errorDetail(err, 'No pudimos iniciar la conversación. Intenta de nuevo.'));
          } finally {
            setStarting(false);
          }
        }}
      >
        {starting ? 'Abriendo conversación…' : 'Contactar productor'}
      </button>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
