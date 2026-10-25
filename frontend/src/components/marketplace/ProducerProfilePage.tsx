import { useEffect, useState } from 'react';
import { api, type Farm, type PublicProducerOffer, type PublicProducerProfile } from '@/services/api';
import { navigateTo } from '@/components/public/publicRoutes';
import { formatQuantity } from '@/utils/units';
import { formatPricePerUnit } from '@/utils/money';
import { PublicShell } from './PublicShell';
import { MARKETPLACE_PATH, offerPath } from './marketplaceRoutes';
import { formatDateOnly } from './formatters';
import { CropImage } from '../operational/CropImage';
import '../styles/ProducerProfile.css';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** Perfil público: solo información autorizada para publicación. Sin contacto, email ni teléfono. */
export function ProducerProfilePage({ producerId }: { producerId: string }) {
  const [profile, setProfile] = useState<PublicProducerProfile | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api.marketplace
      .producer(producerId)
      .then((res) => {
        if (!cancelled) {
          setProfile(res.data);
          setState('ready');
        }
      })
      .catch((err: { response?: { status?: number } }) => {
        if (cancelled) return;
        setState(err.response?.status === 404 ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [producerId]);

  return (
    <PublicShell tag="Productor">
      {state === 'loading' && <p className="auth-muted">Cargando perfil del productor…</p>}
      {state === 'not-found' && (
        <section className="producer-state" aria-live="polite">
          <h1>Este productor no está disponible</h1>
          <p className="auth-muted">Puede que ya no tenga fincas activas o que el enlace esté incompleto.</p>
          <button type="button" className="market-action" onClick={() => navigateTo(MARKETPLACE_PATH)}>
            Volver al mercado
          </button>
        </section>
      )}
      {state === 'error' && (
        <section className="producer-state" role="alert">
          <h1>No pudimos cargar el perfil</h1>
          <p className="auth-muted">Intenta de nuevo en unos minutos.</p>
          <button type="button" className="market-action" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </section>
      )}
      {state === 'ready' && profile && <ProducerDetail profile={profile} />}
    </PublicShell>
  );
}

function ProducerDetail({ profile }: { profile: PublicProducerProfile }) {
  const territory = [profile.municipality.name, profile.department.name].filter(Boolean).join(', ');
  const cropCount = profile.farms.reduce((total, farm) => total + (farm.crops?.length ?? 0), 0);

  return (
    <article className="producer-profile" aria-labelledby="producer-title">
      <header className="producer-header">
        <p className="producer-kicker">Productor</p>
        <h1 id="producer-title">
          {profile.name}
          {profile.verified && <span className="market-badge">Verificado</span>}
        </h1>
        {territory && <p className="producer-territory">{territory}</p>}
        {profile.description && <p className="producer-description">{profile.description}</p>}
      </header>

      <ul className="producer-summary" aria-label="Resumen del productor">
        <li>
          <strong>{profile.farms.length}</strong> {profile.farms.length === 1 ? 'finca' : 'fincas'}
        </li>
        <li>
          <strong>{cropCount}</strong> {cropCount === 1 ? 'cultivo' : 'cultivos'}
        </li>
        <li>
          <strong>{profile.active_offers.length}</strong>{' '}
          {profile.active_offers.length === 1 ? 'oferta disponible' : 'ofertas disponibles'}
        </li>
      </ul>

      <section className="producer-section" aria-labelledby="producer-products-title">
        <h2 id="producer-products-title">Productos disponibles</h2>
        {profile.active_offers.length === 0 ? (
          <p className="auth-muted">Este productor no tiene ofertas disponibles actualmente.</p>
        ) : (
          <ul className="producer-offers">
            {profile.active_offers.map((offer) => (
              <OfferTile key={offer.id} offer={offer} />
            ))}
          </ul>
        )}
      </section>

      <section className="producer-section" aria-labelledby="producer-farms-title">
        <h2 id="producer-farms-title">Fincas y cultivos</h2>
        {profile.farms.length === 0 ? (
          <p className="auth-muted">Este productor no tiene fincas públicas registradas.</p>
        ) : (
          <ul className="producer-farms">
            {profile.farms.map((farm) => (
              <FarmTile
                key={farm.id}
                farm={farm}
                offersCount={profile.active_offers.filter((offer) => offer.farm_id === farm.id).length}
              />
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function OfferTile({ offer }: { offer: PublicProducerOffer }) {
  const price = typeof offer.price_per_unit === 'number' ? formatPricePerUnit(offer.price_per_unit, offer.unit) : null;
  const from = formatDateOnly(offer.available_from);
  const until = formatDateOnly(offer.available_until);

  return (
    <li className="producer-offer">
      <article aria-label={`${offer.crop_name} en ${offer.farm_name}`}>
        <CropImage src={offer.crop_image_url} cropName={offer.crop_name} variant="thumb" />
        <h3>{offer.crop_name}</h3>
        <p className="market-quantity">{formatQuantity(offer.quantity, offer.unit)}</p>
        <dl className="market-meta">
          {price && (
            <div>
              <dt>Precio</dt>
              <dd>{price}</dd>
            </div>
          )}
          <div>
            <dt>Finca</dt>
            <dd>{offer.farm_name}</dd>
          </div>
          {offer.municipality_name && (
            <div>
              <dt>Municipio</dt>
              <dd>{offer.municipality_name}</dd>
            </div>
          )}
          <div>
            <dt>Disponibilidad</dt>
            <dd>{from || until ? `${from ?? 'Desde hoy'} – ${until ?? 'sin fecha final'}` : 'Vigente'}</dd>
          </div>
        </dl>
        <button type="button" className="market-action" onClick={() => navigateTo(offerPath(offer.id))}>
          Ver oferta
        </button>
      </article>
    </li>
  );
}

function FarmTile({ farm, offersCount }: { farm: Farm; offersCount: number }) {
  const hasCoordinates = Number.isFinite(farm.latitude) && Number.isFinite(farm.longitude);
  const departmentCode = farm.municipality_code?.slice(0, 2);

  return (
    <li className="producer-farm">
      <article aria-label={`Finca ${farm.name}`}>
        <h3>{farm.name}</h3>
        {farm.municipality_name && <p className="auth-muted">{farm.municipality_name}</p>}
        {farm.crops && farm.crops.length > 0 ? (
          <ul className="producer-farm-crops" aria-label={`Cultivos de ${farm.name}`}>
            {farm.crops.map((crop, index) => (
              <li key={`${crop.name}-${index}`}>
                {crop.name}
                {crop.area_hectares ? ` · ${formatQuantity(crop.area_hectares, 'ha')}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="auth-muted">No hay cultivos públicos registrados.</p>
        )}
        <p className="producer-farm-offers">
          {offersCount === 0 ? 'Sin ofertas disponibles' : `${offersCount} ${offersCount === 1 ? 'oferta' : 'ofertas'} disponibles`}
        </p>
        <div className="producer-farm-actions">
          {hasCoordinates && (
            <button
              type="button"
              className="market-action"
              onClick={() => {
                const params = new URLSearchParams();
                if (departmentCode) params.set('department', departmentCode);
                if (farm.municipality_code) params.set('municipality', farm.municipality_code);
                navigateTo(`/?${params.toString()}`);
              }}
            >
              Ver en el mapa
            </button>
          )}
          {offersCount > 0 && (
            <button
              type="button"
              className="farm-popup-link"
              onClick={() => navigateTo(`${MARKETPLACE_PATH}?farm=${farm.id}`)}
            >
              Ver ofertas
            </button>
          )}
        </div>
      </article>
    </li>
  );
}
