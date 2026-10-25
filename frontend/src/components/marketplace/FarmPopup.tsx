import { useEffect, useState } from 'react';
import { api, type Farm } from '@/services/api';
import { navigateTo } from '@/components/public/publicRoutes';
import { formatQuantity } from '@/utils/units';
import { MARKETPLACE_PATH } from './marketplaceRoutes';
import { producerPath } from './producerRoutes';

/**
 * Popup de una finca registrada (dato operacional). No convierte datos EVA en ofertas:
 * la disponibilidad se consulta a las ofertas vigentes declaradas por el productor.
 */
export function FarmPopup({ farm }: { farm: Farm }) {
  const [offersCount, setOffersCount] = useState<number | null>(null);
  const [offersError, setOffersError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.operational.currentOffers
      .list({ farm_id: farm.id })
      .then((res) => {
        if (!cancelled) setOffersCount(res.data.data.length);
      })
      .catch(() => {
        if (!cancelled) setOffersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [farm.id]);

  const offersLine = offersError
    ? 'No pudimos consultar las ofertas.'
    : offersCount === null
      ? 'Consultando ofertas…'
      : offersCount === 0
        ? 'Sin ofertas disponibles actualmente.'
        : `${offersCount} ${offersCount === 1 ? 'oferta disponible' : 'ofertas disponibles'}`;

  return (
    <div className="farm-popup-content">
      <h4>🏡 {farm.name}</h4>
      {farm.producer_name && (
        <p>
          <strong>Productor:</strong> {farm.producer_name}
        </p>
      )}
      {farm.municipality_name && (
        <p>
          <strong>Municipio:</strong> {farm.municipality_name}
        </p>
      )}
      {farm.crops && farm.crops.length > 0 && (
        <div>
          <p>
            <strong>Cultivos:</strong>
          </p>
          <ul className="farm-popup-crops">
            {farm.crops.map((crop, index) => (
              <li key={`${crop.name}-${index}`}>
                {crop.image_url && (
                  <img className="farm-popup-thumb" src={crop.image_url} alt="" loading="lazy" decoding="async" />
                )}
                {crop.name}
                {crop.area_hectares ? ` · ${formatQuantity(crop.area_hectares, 'ha')}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="farm-popup-offers">{offersLine}</p>
      <div className="farm-popup-actions">
        <button type="button" className="market-action" onClick={() => navigateTo(`${MARKETPLACE_PATH}?farm=${farm.id}`)}>
          Ver ofertas
        </button>
        {farm.producer_id && (
          <button type="button" className="farm-popup-link" onClick={() => navigateTo(producerPath(farm.producer_id!))}>
            Ver productor
          </button>
        )}
      </div>
      <p className="farm-source-badge">Finca registrada en Raíces Conectadas</p>
    </div>
  );
}
