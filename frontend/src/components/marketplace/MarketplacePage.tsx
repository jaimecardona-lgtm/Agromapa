import { useEffect, useMemo, useState } from 'react';
import { api, type CurrentOffer, type GeoUnit } from '@/services/api';
import { errorDetail } from '@/services/identity';
import { navigateTo } from '@/components/public/publicRoutes';
import { PublicShell } from './PublicShell';
import { marketFiltersFromSearch, marketSearchFromFilters, offerPath } from './marketplaceRoutes';
import { formatDateOnly, formatPrice, isAvailableToday } from './formatters';
import { formatQuantity } from '@/utils/units';
import { CropImage } from '../operational/CropImage';

export type SortOrder = 'recent' | 'availability';

export interface MarketFilters {
  crop: string;
  departmentCode: string;
  municipalityCode: string;
  farmId: string;
  producerId: string;
  minQuantity: string;
  onlyAvailableToday: boolean;
  sort: SortOrder;
}

export const DEFAULT_FILTERS: MarketFilters = {
  crop: '',
  departmentCode: '',
  municipalityCode: '',
  farmId: '',
  producerId: '',
  minQuantity: '',
  onlyAvailableToday: true,
  sort: 'recent',
};

/** Filtros y orden que se aplican en el cliente sobre la lista ya cargada. */
export function applyClientFilters(offers: CurrentOffer[], filters: MarketFilters, today = new Date()): CurrentOffer[] {
  const minimum = Number(filters.minQuantity);
  const hasMinimum = filters.minQuantity.trim() !== '' && Number.isFinite(minimum);

  const filtered = offers.filter((offer) => {
    if (hasMinimum && offer.quantity < minimum) return false;
    if (filters.onlyAvailableToday && !isAvailableToday(offer.available_until, today)) return false;
    if (filters.farmId && offer.farm_id !== filters.farmId) return false;
    if (filters.producerId && offer.producer_id !== filters.producerId) return false;
    return true;
  });

  if (filters.sort === 'availability') {
    // Primero las que vencen antes; sin fecha final al final.
    return [...filtered].sort((a, b) => {
      if (!a.available_until && !b.available_until) return 0;
      if (!a.available_until) return 1;
      if (!b.available_until) return -1;
      return a.available_until.localeCompare(b.available_until);
    });
  }
  return filtered;
}

/** Tarjeta pública. El contacto no aparece aquí: solo en el detalle, y solo si el backend lo entrega. */
function OfferCard({ offer }: { offer: CurrentOffer }) {
  const price = formatPrice(offer.price_per_unit, offer.unit);
  const from = formatDateOnly(offer.available_from);
  const until = formatDateOnly(offer.available_until);

  return (
    <li className="market-card">
      <article aria-label={`${offer.crop_name} en ${offer.farm_name}`}>
        <CropImage src={offer.crop_image_url} cropName={offer.crop_name} variant="thumb" />
        <div className="market-card-head">
          <h3>{offer.crop_name}</h3>
          {offer.producer_verified && <span className="market-badge">Verificado</span>}
        </div>
        <p className="market-quantity">
          {formatQuantity(offer.quantity, offer.unit)}
        </p>
        <dl className="market-meta">
          {price && (
            <div>
              <dt>Precio</dt>
              <dd>{price}</dd>
            </div>
          )}
          <div>
            <dt>Disponibilidad</dt>
            <dd>{from || until ? `${from ?? 'Desde hoy'} – ${until ?? 'sin fecha final'}` : 'Vigente'}</dd>
          </div>
          <div>
            <dt>Finca</dt>
            <dd>{offer.farm_name}</dd>
          </div>
          <div>
            <dt>Municipio</dt>
            <dd>{offer.municipality_name}</dd>
          </div>
          <div>
            <dt>Productor</dt>
            <dd>{offer.producer_name}</dd>
          </div>
        </dl>
        <button type="button" className="market-action" onClick={() => navigateTo(offerPath(offer.id))}>
          Ver oferta
        </button>
      </article>
    </li>
  );
}

export function MarketplacePage() {
  // Los filtros vienen de la URL (sobreviven a F5 y se pueden compartir).
  const [filters, setFilters] = useState<MarketFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...marketFiltersFromSearch(window.location.search),
  }));
  const [departments, setDepartments] = useState<GeoUnit[]>([]);
  const [municipalities, setMunicipalities] = useState<GeoUnit[]>([]);
  const [offers, setOffers] = useState<CurrentOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.territories
      .getDepartments()
      .then((res) => {
        if (!cancelled) setDepartments(res.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!filters.departmentCode) {
      setMunicipalities([]);
      return undefined;
    }
    api.territories
      .getMunicipalities(filters.departmentCode)
      .then((res) => {
        if (!cancelled) setMunicipalities(res.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setMunicipalities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.departmentCode]);

  // Cultivo y territorio se piden al servidor; el cultivo con una pausa corta para no pedir en cada tecla.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    const timer = window.setTimeout(() => {
      api.operational.currentOffers
        .list({
          crop: filters.crop.trim() || undefined,
          department_code: filters.departmentCode || undefined,
          municipality_code: filters.municipalityCode || undefined,
        })
        .then((res) => {
          if (!cancelled) setOffers(res.data.data ?? []);
        })
        .catch((err) => {
          if (!cancelled) {
            setOffers([]);
            setError(errorDetail(err, 'No pudimos cargar las ofertas. Intenta de nuevo.'));
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filters.crop, filters.departmentCode, filters.municipalityCode]);

  const visible = useMemo(() => (offers ? applyClientFilters(offers, filters) : []), [offers, filters]);

  useEffect(() => {
    const search = marketSearchFromFilters(filters);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
  }, [filters]);

  function update<K extends keyof MarketFilters>(key: K, value: MarketFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <PublicShell tag="Mercado">
      <section className="market-intro" aria-labelledby="market-title">
        <h1 id="market-title">Ofertas productivas vigentes</h1>
        <p className="auth-muted">
          Productos publicados por fincas registradas en Raíces Conectadas. Explorar es libre; para contactar a un
          productor necesitas una cuenta de comprador.
        </p>
      </section>

      {(filters.farmId || filters.producerId) && (
        <p className="market-scope" role="status">
          Mostrando ofertas de {filters.farmId ? 'una finca' : 'un productor'}.{' '}
          <button
            type="button"
            className="market-action"
            onClick={() => setFilters((current) => ({ ...current, farmId: '', producerId: '' }))}
          >
            Quitar filtro
          </button>
        </p>
      )}
      <form className="market-filters" aria-label="Filtros del mercado" onSubmit={(event) => event.preventDefault()}>
        <label className="market-field">
          <span>Producto o cultivo</span>
          <input
            type="search"
            placeholder="Ej. café, cacao, plátano"
            value={filters.crop}
            onChange={(event) => update('crop', event.target.value)}
          />
        </label>
        <label className="market-field">
          <span>Departamento</span>
          <select
            value={filters.departmentCode}
            onChange={(event) =>
              setFilters((current) => ({ ...current, departmentCode: event.target.value, municipalityCode: '' }))
            }
          >
            <option value="">Todos</option>
            {departments.map((dept) => (
              <option key={dept.dane_code} value={dept.dane_code}>
                {dept.name}
              </option>
            ))}
          </select>
        </label>
        <label className="market-field">
          <span>Municipio</span>
          <select
            value={filters.municipalityCode}
            disabled={!filters.departmentCode}
            onChange={(event) => update('municipalityCode', event.target.value)}
          >
            <option value="">Todos</option>
            {municipalities.map((mun) => (
              <option key={mun.dane_code} value={mun.dane_code}>
                {mun.name}
              </option>
            ))}
          </select>
        </label>
        <label className="market-field">
          <span>Cantidad mínima</span>
          <input
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.minQuantity}
            onChange={(event) => update('minQuantity', event.target.value)}
          />
        </label>
        <label className="market-field market-field-check">
          <input
            type="checkbox"
            checked={filters.onlyAvailableToday}
            onChange={(event) => update('onlyAvailableToday', event.target.checked)}
          />
          <span>Solo disponibles hoy</span>
        </label>
        <label className="market-field">
          <span>Orden</span>
          <select value={filters.sort} onChange={(event) => update('sort', event.target.value as SortOrder)}>
            <option value="recent">Más recientes</option>
            <option value="availability">Disponibilidad (vence antes)</option>
          </select>
        </label>
      </form>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {offers === null && !error && <p className="auth-muted">Cargando ofertas…</p>}
      {offers !== null && visible.length === 0 && !error && (
        <p className="auth-muted">No hay ofertas vigentes con estos filtros.</p>
      )}
      {visible.length > 0 && (
        <>
          <p className="market-count" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'oferta' : 'ofertas'}
          </p>
          <ul className="market-grid">
            {visible.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </ul>
        </>
      )}
    </PublicShell>
  );
}
