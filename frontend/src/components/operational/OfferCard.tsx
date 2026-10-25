import type { ProductionOffer } from '@/services/api';
import { formatPricePerUnit } from '@/utils/money';
import { CropImage } from './CropImage';
import { formatQuantity } from '@/utils/units';
import { OFFER_STATUS_LABELS, OFFER_STATUS_TONE, formatDateShort } from './offerFormat';

interface OfferCardProps {
  offer: ProductionOffer;
  busy: boolean;
  onSetStatus: (status: 'available' | 'sold_out' | 'inactive') => void;
  onViewMarketplace: () => void;
}

/** Tarjeta de una oferta propia. Acciones solo las que el backend soporta (PATCH status). */
export function OfferCard({ offer, busy, onSetStatus, onViewMarketplace }: OfferCardProps) {
  const crop = offer.crop_name?.trim() || 'Cultivo';
  const tone = OFFER_STATUS_TONE[offer.status] ?? 'muted';
  const period =
    offer.availability_start && offer.availability_end
      ? `${formatDateShort(offer.availability_start)} → ${formatDateShort(offer.availability_end)}`
      : offer.availability_start
        ? `Desde ${formatDateShort(offer.availability_start)}`
        : offer.availability_end
          ? `Hasta ${formatDateShort(offer.availability_end)}`
          : 'Sin fecha definida';

  return (
    <article className="offer-card" aria-labelledby={`offer-${offer.id}-title`}>
      <CropImage src={offer.crop_image_url} cropName={crop} variant="card" />
      <div className="offer-card-body">
        <header className="offer-card-header">
          <h5 id={`offer-${offer.id}-title`}>{crop}</h5>
          <span className={`offer-badge offer-badge--${tone}`}>{OFFER_STATUS_LABELS[offer.status] ?? offer.status}</span>
        </header>

        <dl className="offer-facts">
          {offer.farm_name && (
            <div>
              <dt>Finca</dt>
              <dd>{offer.farm_name}</dd>
            </div>
          )}
          <div>
            <dt>Cantidad</dt>
            <dd>{formatQuantity(offer.available_quantity, offer.unit)}</dd>
          </div>
          {offer.price_per_unit != null && (
            <div>
              <dt>Precio</dt>
              <dd>{formatPricePerUnit(offer.price_per_unit, offer.unit)}</dd>
            </div>
          )}
          <div>
            <dt>Disponibilidad</dt>
            <dd>{period}</dd>
          </div>
        </dl>

        {offer.description && <p className="offer-description">{offer.description}</p>}

        <div className="offer-actions">
          {offer.status === 'available' && (
            <>
              <button type="button" className="offer-action" disabled={busy} onClick={() => onSetStatus('sold_out')}>
                Marcar agotada
              </button>
              <button type="button" className="offer-action" disabled={busy} onClick={() => onSetStatus('inactive')}>
                Desactivar
              </button>
              <button type="button" className="offer-action offer-action--link" onClick={onViewMarketplace}>
                Ver en Marketplace
              </button>
            </>
          )}
          {(offer.status === 'inactive' || offer.status === 'sold_out') && (
            <button type="button" className="offer-action" disabled={busy} onClick={() => onSetStatus('available')}>
              Reactivar
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
