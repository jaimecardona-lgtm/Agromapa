import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { api, Producer, Farm, FarmCropDetail, CurrentOffer, ProductionOffer } from '@/services/api';
import { errorDetail, identityApi } from '@/services/identity';
import { navigateTo } from '@/components/public/publicRoutes';
import { offerPath } from '@/components/marketplace/marketplaceRoutes';
import { OfferCard } from './operational/OfferCard';
import { CropImage } from './operational/CropImage';
import { formatDateShort } from './operational/offerFormat';
import { formatPricePerUnit } from '@/utils/money';
import { formatQuantity, unitLabel } from '@/utils/units';
import { useAuth } from '@/auth/AuthContext';
import { ProducerGate } from '@/components/auth/ProducerGate';
import '../styles/OperationalManagement.css';

type Tab = 'producers' | 'farms' | 'crops' | 'offers' | 'current-offer';

// Pestañas de escritura productiva: requieren cuenta con rol productor.
const PRODUCTIVE_TABS: Tab[] = ['producers', 'farms', 'crops', 'offers'];

// Compara nombres de cultivo sin tildes, mayúsculas ni espacios sobrantes (Café == cafe).
function normalizeCropName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Conserva la finca elegida si sigue en la lista; con una sola finca la selecciona sola.
function keepOrPickFarm(current: Farm | null, farms: Farm[]): Farm | null {
  const same = current ? farms.find((f) => f.id === current.id) : undefined;
  if (same) return same;
  return farms.length === 1 ? farms[0] : null;
}

function ProducerLinkError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="note" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

type OfferFieldErrors = Partial<Record<'crop' | 'quantity' | 'availability_end' | 'price', string>>;

const EMPTY_OFFER_FORM = {
  available_quantity: '',
  unit: 'kg',
  availability_start: '',
  availability_end: '',
  price_per_unit: '',
  description: '',
};

// Estado de la lista de cultivos: idle (sin pedir), loading, success (incluye lista vacía real) o error.
type CropsState =
  | { status: 'idle' }
  | { status: 'loading'; farmId: string }
  | { status: 'success'; farmId: string; crops: FarmCropDetail[] }
  | { status: 'error'; farmId: string; message: string };

type IllustrationState = Record<string, { status: 'pending' | 'none' | 'ready' | 'failed'; message?: string }>;

export function OperationalManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('producers');
  const { status, roles } = useAuth();
  const canManage = status === 'authenticated' && roles.includes('producer');
  const [farms, setFarms] = useState<Farm[]>([]);
  // Estado explícito de la lista de cultivos: una sola fuente de verdad, ligada a la finca que respondió.
  const [cropsState, setCropsState] = useState<CropsState>({ status: 'idle' });
  // Generación de imagen ilustrativa por cultivo (una vez; sin reintentos automáticos).
  const [illustrationState, setIllustrationState] = useState<IllustrationState>({});
  // Solo la última request emitida puede aplicar su respuesta (StrictMode y cambios rápidos).
  const cropsRequestRef = useRef(0);
  const selectedFarmIdRef = useRef<string | null>(null);
  const [currentOffers, setCurrentOffers] = useState<CurrentOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forms state
  const [selectedProducer, setSelectedProducer] = useState<Producer | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<FarmCropDetail | null>(null);
  const selectedFarmId = selectedFarm?.id ?? null;
  // Cultivos de la finca seleccionada, solo si la respuesta corresponde a ella.
  const loadedCrops =
    cropsState.status === 'success' && cropsState.farmId === selectedFarmId ? cropsState.crops : [];
  // Estado de cultivos solo si corresponde a la finca seleccionada (nunca de otra finca).
  const selectedCropsState =
    cropsState.status !== 'idle' && cropsState.farmId === selectedFarmId ? cropsState : null;
  // El cultivo de la oferta sale solo de la lista de la finca seleccionada.
  const offerCrop = loadedCrops.find((c) => c.id === selectedCrop?.id) ?? null;
  // Vinculación del productor de la cuenta: estado propio, para que otras cargas no lo borren.
  const [producerLoading, setProducerLoading] = useState(false);
  const [producerError, setProducerError] = useState<string | null>(null);
  const [producerAttempt, setProducerAttempt] = useState(0);

  // Form inputs
  const [farmForm, setFarmForm] = useState({
    name: '',
    municipality_code: '',
    latitude: '',
    longitude: '',
    description: '',
    area_ha: '',
  });

  const [gpsState, setGpsState] = useState<'idle' | 'requesting' | 'success' | 'permission_denied' | 'unavailable' | 'error'>('idle');

  const [cropForm, setCropForm] = useState({
    crop_name: '',
    area_hectares: '',
    description: '',
    variety: '',
  });
  const cropNameMatchesExisting =
    cropForm.crop_name.trim() !== '' &&
    loadedCrops.some((c) => normalizeCropName(c.crop_name) === normalizeCropName(cropForm.crop_name));

  const [offerForm, setOfferForm] = useState(EMPTY_OFFER_FORM);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerMessage, setOfferMessage] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [myOffers, setMyOffers] = useState<ProductionOffer[]>([]);
  const [myOffersLoading, setMyOffersLoading] = useState(false);
  const [myOffersError, setMyOffersError] = useState<string | null>(null);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [offerFieldErrors, setOfferFieldErrors] = useState<OfferFieldErrors>({});
  const [offerActionId, setOfferActionId] = useState<string | null>(null);
  const [offerActionError, setOfferActionError] = useState<string | null>(null);
  const myOffersRef = useRef<HTMLDivElement>(null);
  const offersLoadedOnce = useRef(false);
  const activeOffersCount = myOffers.filter((o) => o.status === 'available').length;

  // Load data
  useEffect(() => {
    loadCurrentOffers();
  }, []);

  // El productor es el de la cuenta (vínculo por token), nunca uno elegido de una lista.
  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    setProducerLoading(true);
    setProducerError(null);

    api.operational.producers
      .linkMine()
      .then(async (res) => {
        if (cancelled) return;
        setSelectedProducer(res.data);
        const farmsRes = await api.operational.farms.listByProducer(res.data.id);
        if (cancelled) return;
        setFarms(farmsRes.data);
        setSelectedFarm((current) => keepOrPickFarm(current, farmsRes.data));
      })
      .catch((err) => {
        if (cancelled) return;
        setProducerError('No pudimos cargar tu registro productivo.');
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) setProducerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, producerAttempt]);

  async function loadFarmsByProducer(producerId: string) {
    try {
      setLoading(true);
      const res = await api.operational.farms.listByProducer(producerId);
      setFarms(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load farms');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Lee los cultivos de la finca desde la API (nunca solo del estado local).
  // Una respuesta se aplica solo si es la última request y la finca sigue seleccionada.
  const loadCrops = useCallback(async (farmId: string) => {
    const requestId = ++cropsRequestRef.current;
    setCropsState({ status: 'loading', farmId });
    try {
      const res = await api.operational.crops.list(farmId);
      if (requestId !== cropsRequestRef.current || farmId !== selectedFarmIdRef.current) return;
      setCropsState({ status: 'success', farmId, crops: res.data });
    } catch (err) {
      if (requestId !== cropsRequestRef.current || farmId !== selectedFarmIdRef.current) return;
      setCropsState({ status: 'error', farmId, message: 'No pudimos cargar los cultivos.' });
      console.error(err);
    }
  }, []);

  // Se carga al entrar a la pestaña Cultivos o al cambiar de finca. Depende del id, no del objeto.
  useEffect(() => {
    selectedFarmIdRef.current = selectedFarmId;
    if ((activeTab === 'crops' || activeTab === 'offers') && canManage && selectedFarmId) {
      loadCrops(selectedFarmId);
    }
  }, [activeTab, canManage, selectedFarmId, loadCrops]);

  // Mis ofertas: fuente real (/api/me/offers) al entrar a la pestaña.
  const loadMyOffers = useCallback(async () => {
    setMyOffersLoading(true);
    setMyOffersError(null);
    try {
      const res = await identityApi.myOffers();
      setMyOffers(res.data);
      // Primera carga: sin ofertas el formulario queda abierto; con ofertas, cerrado.
      if (!offersLoadedOnce.current) {
        offersLoadedOnce.current = true;
        setShowCreateOffer(res.data.length === 0);
      }
    } catch (err) {
      setMyOffersError(errorDetail(err, 'No pudimos cargar tus ofertas.'));
      console.error(err);
    } finally {
      setMyOffersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'offers' && canManage) {
      loadMyOffers();
    }
  }, [activeTab, canManage, loadMyOffers]);

  // El mensaje de éxito se retira solo; también puede cerrarse a mano.
  useEffect(() => {
    if (!offerMessage) return undefined;
    const timer = window.setTimeout(() => setOfferMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [offerMessage]);

  async function setOfferStatus(offer: ProductionOffer, status: 'available' | 'sold_out' | 'inactive') {
    setOfferActionId(offer.id);
    setOfferActionError(null);
    try {
      await api.operational.offers.update(offer.id, { status });
      await loadMyOffers();
    } catch (err) {
      setOfferActionError(errorDetail(err, 'No pudimos actualizar la oferta. Intenta de nuevo.'));
      console.error(err);
    } finally {
      setOfferActionId(null);
    }
  }

  async function loadCurrentOffers() {
    try {
      setLoading(true);
      const res = await api.operational.currentOffers.list();
      setCurrentOffers(res.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to load current offers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Farm operations
  async function handleRequestGPS() {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      setError('Geolocation not available in this browser');
      return;
    }

    setGpsState('requesting');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFarmForm((prev) => ({
          ...prev,
          latitude: latitude.toFixed(6),
          longitude: longitude.toFixed(6),
        }));
        setGpsState('success');
      },
      (error) => {
        if (error.code === 1) {
          setGpsState('permission_denied');
          setError('Permission denied. You can still enter coordinates manually.');
        } else {
          setGpsState('error');
          setError(`GPS error: ${error.message}`);
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  async function handleCreateFarm(e: FormEvent) {
    e.preventDefault();
    if (!selectedProducer) {
      setError('Select a producer first');
      return;
    }

    try {
      setLoading(true);
      await api.operational.farms.create({
        name: farmForm.name,
        municipality_code: farmForm.municipality_code,
        latitude: parseFloat(farmForm.latitude),
        longitude: parseFloat(farmForm.longitude),
        description: farmForm.description,
        area_ha: farmForm.area_ha ? parseFloat(farmForm.area_ha) : undefined,
      });
      setFarmForm({ name: '', municipality_code: '', latitude: '', longitude: '', description: '', area_ha: '' });
      await loadFarmsByProducer(selectedProducer.id);
      setError(null);
    } catch (err) {
      setError('Failed to create farm');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Crop operations
  // Imagen ilustrativa por cultivo: no bloquea nada y no reintenta solo.
  function startIllustration(farmCropId: string) {
    setIllustrationState((current) => ({ ...current, [farmCropId]: { status: 'pending' } }));
    api.operational.crops
      .illustration(farmCropId)
      .then((res) => {
        setIllustrationState((current) => ({
          ...current,
          [farmCropId]: { status: res.data.status, message: res.data.message ?? undefined },
        }));
        // Solo recarga si la imagen cambió; un fallo no genera tráfico extra.
        if (res.data.status === 'ready' && selectedFarmId) void loadCrops(selectedFarmId);
      })
      .catch((err: { response?: { status?: number } }) => {
        const disabled = err.response?.status === 503;
        setIllustrationState((current) => ({
          ...current,
          [farmCropId]: {
            status: 'failed',
            message: disabled ? 'Generación de imágenes no configurada.' : 'No pudimos generar la imagen. Puedes intentarlo de nuevo.',
          },
        }));
      });
  }

  async function handleCreateCrop(e: FormEvent) {
    e.preventDefault();
    if (!selectedFarm) {
      setError('Select a farm first');
      return;
    }

    const cropName = cropForm.crop_name.trim();
    if (!cropName) {
      setError('Escribe el nombre del cultivo.');
      return;
    }

    try {
      setLoading(true);
      const created = await api.operational.crops.create(selectedFarm.id, {
        crop_name: cropName,
        area_hectares: cropForm.area_hectares ? parseFloat(cropForm.area_hectares) : undefined,
        description: cropForm.description,
      });
      // La imagen ilustrativa arranca aparte: si falla, el cultivo ya está guardado y queda el placeholder.
      startIllustration(created.data.id);
      // El formulario se limpia solo después de confirmar el guardado.
      setCropForm({ crop_name: '', area_hectares: '', description: '', variety: '' });
      setError(null);
      await loadCrops(selectedFarm.id);
    } catch (err) {
      setError('Failed to create crop');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Offer operations
  async function handleCreateOffer(e: FormEvent) {
    e.preventDefault();
    setOfferMessage(null);
    setOfferError(null);

    const quantity = parseFloat(offerForm.available_quantity);
    const start = offerForm.availability_start;
    const end = offerForm.availability_end;
    const price = offerForm.price_per_unit ? parseFloat(offerForm.price_per_unit) : undefined;
    // Validación junto a cada campo; ningún error envía la petición.
    const errors: OfferFieldErrors = {};
    if (!offerCrop) errors.crop = 'Selecciona un cultivo de la finca.';
    if (!(quantity > 0)) errors.quantity = 'La cantidad disponible debe ser mayor que cero.';
    if (start && end && end < start) errors.availability_end = 'La fecha de fin no puede ser anterior a la de inicio.';
    if (price !== undefined && !(price >= 0)) errors.price = 'El precio no puede ser negativo.';
    setOfferFieldErrors(errors);
    if (!offerCrop || Object.keys(errors).length > 0) return;

    setOfferSaving(true);
    try {
      await api.operational.offers.create(offerCrop.id, {
        available_quantity: quantity,
        unit: offerForm.unit,
        // Campos vacíos se omiten: enviar '' no es una fecha válida.
        availability_start: start || undefined,
        availability_end: end || undefined,
        price_per_unit: price,
        description: offerForm.description.trim() || undefined,
      });
      setOfferForm(EMPTY_OFFER_FORM);
      setOfferFieldErrors({});
      setShowCreateOffer(false);
      setOfferMessage(`Oferta de ${offerCrop.crop_name.trim()} publicada correctamente.`);
      await loadMyOffers();
      myOffersRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setOfferError(errorDetail(err, 'No pudimos publicar la oferta. Revisa los datos e intenta de nuevo.'));
      console.error(err);
    } finally {
      setOfferSaving(false);
    }
  }

  return (
    <div className="operational-management">
      <h2>Raíces Conectadas - Gestión Productiva</h2>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'producers' ? 'active' : ''}`}
          onClick={() => setActiveTab('producers')}
        >
          Mi productor
        </button>
        <button
          className={`tab ${activeTab === 'farms' ? 'active' : ''}`}
          onClick={() => setActiveTab('farms')}
        >
          Fincas
        </button>
        <button
          className={`tab ${activeTab === 'crops' ? 'active' : ''}`}
          onClick={() => setActiveTab('crops')}
        >
          Cultivos
        </button>
        <button
          className={`tab ${activeTab === 'offers' ? 'active' : ''}`}
          onClick={() => setActiveTab('offers')}
        >
          Ofertas
        </button>
        <button
          className={`tab ${activeTab === 'current-offer' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('current-offer');
            loadCurrentOffers();
          }}
        >
          Oferta Actual
        </button>
      </div>

      <div className="tab-content">
        {PRODUCTIVE_TABS.includes(activeTab) && !canManage && (
          <div className="section">
            <ProducerGate>{null}</ProducerGate>
          </div>
        )}

        {/* Producers Tab: el registro productivo se vincula a la cuenta */}
        {activeTab === 'producers' && canManage && (
          <div className="section">
            <h3>Mi registro productivo</h3>
            <p>
              Tu registro está vinculado a tu cuenta
              {selectedProducer ? `: ${selectedProducer.name}` : ''}. Las fincas, cultivos y ofertas que registres
              quedan a tu nombre.
            </p>
          </div>
        )}

        {/* Farms Tab */}
        {activeTab === 'farms' && canManage && (
          <div className="section">
            <h3>Gestionar Fincas {selectedProducer && `- ${selectedProducer.name}`}</h3>

            {selectedProducer ? (
              <>
                <form onSubmit={handleCreateFarm} className="form">
                  <input aria-label="Nombre de la finca"
                    type="text"
                    placeholder="Nombre de la finca"
                    value={farmForm.name}
                    onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })}
                    required
                  />
                  <input aria-label="Código municipio (DANE)"
                    type="text"
                    placeholder="Código municipio (DANE)"
                    value={farmForm.municipality_code}
                    onChange={(e) => setFarmForm({ ...farmForm, municipality_code: e.target.value })}
                    required
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input aria-label="Latitud"
                      type="number"
                      placeholder="Latitud"
                      step="0.000001"
                      value={farmForm.latitude}
                      onChange={(e) => setFarmForm({ ...farmForm, latitude: e.target.value })}
                      required
                    />
                    <input aria-label="Longitud"
                      type="number"
                      placeholder="Longitud"
                      step="0.000001"
                      value={farmForm.longitude}
                      onChange={(e) => setFarmForm({ ...farmForm, longitude: e.target.value })}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRequestGPS}
                    disabled={gpsState === 'requesting' || loading}
                    style={{
                      background: gpsState === 'success' ? '#2c5a2c' : '#666',
                      color: 'white',
                      padding: '8px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: gpsState === 'requesting' ? 'wait' : 'pointer',
                    }}
                  >
                    {gpsState === 'idle' && '📍 Usar mi ubicación'}
                    {gpsState === 'requesting' && '⏳ Solicitando...'}
                    {gpsState === 'success' && '✓ Ubicación obtenida'}
                    {gpsState === 'permission_denied' && '✗ Permiso denegado'}
                    {gpsState === 'unavailable' && '✗ No disponible'}
                    {gpsState === 'error' && '✗ Error'}
                  </button>
                  <input aria-label="Área (hectáreas)"
                    type="number"
                    placeholder="Área (hectáreas)"
                    step="0.01"
                    value={farmForm.area_ha}
                    onChange={(e) => setFarmForm({ ...farmForm, area_ha: e.target.value })}
                  />
                  <textarea aria-label="Descripción de la finca"
                    placeholder="Descripción"
                    value={farmForm.description}
                    onChange={(e) => setFarmForm({ ...farmForm, description: e.target.value })}
                  />
                  <button type="submit" disabled={loading}>
                    {loading ? 'Creando...' : 'Crear Finca'}
                  </button>
                </form>

                <div className="list">
                  <h4>Fincas del Productor</h4>
                  {farms.map((f) => (
                    <div
                      key={f.id}
                      className={`item ${selectedFarm?.id === f.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedFarm(f);
                        setActiveTab('crops');
                      }}
                    >
                      <div className="item-header">
                        <strong>{f.name}</strong>
                      </div>
                      {f.municipality_name && <div className="item-detail">📍 {f.municipality_name}</div>}
                      {f.area_ha && <div className="item-detail">📐 {f.area_ha} ha</div>}
                    </div>
                  ))}
                </div>
              </>
            ) : producerLoading ? (
              <p className="note">Cargando tu registro productivo...</p>
            ) : producerError ? (
              <ProducerLinkError message={producerError} onRetry={() => setProducerAttempt((n) => n + 1)} />
            ) : (
              <p className="note">Tu registro productivo aún no está disponible.</p>
            )}
          </div>
        )}

        {/* Crops Tab */}
        {activeTab === 'crops' && canManage && (
          <div className="section">
            <h3>Gestionar Cultivos {selectedFarm && `- ${selectedFarm.name}`}</h3>

            {selectedFarm ? (
              <>
                <form onSubmit={handleCreateCrop} className="form">
                  <input
                    id="crop-name"
                    name="crop_name"
                    type="text"
                    aria-label="Nombre del cultivo"
                    placeholder="Nombre del cultivo"
                    value={cropForm.crop_name}
                    onChange={(e) => setCropForm({ ...cropForm, crop_name: e.target.value })}
                    required
                  />
                  {cropNameMatchesExisting && (
                    <p className="note" role="status">
                      Ya hay un cultivo con este nombre en la finca. Se guardará como uno nuevo.
                    </p>
                  )}
                  {/* Variety not in current schema */}
                  <input
                    id="crop-variety"
                    name="variety"
                    type="text"
                    aria-label="Variedad (opcional)"
                    placeholder="Variedad (opcional)"
                    value={cropForm.variety}
                    onChange={(e) => setCropForm({ ...cropForm, variety: e.target.value })}
                  />
                  <input
                    id="crop-area"
                    name="area_hectares"
                    type="number"
                    aria-label="Área en hectáreas"
                    placeholder="Área (hectáreas)"
                    step="0.01"
                    value={cropForm.area_hectares}
                    onChange={(e) => setCropForm({ ...cropForm, area_hectares: e.target.value })}
                  />
                  <button type="submit" disabled={loading}>
                    {loading ? 'Creando...' : 'Crear Cultivo'}
                  </button>
                </form>

                <div className="list">
                  <h4>Cultivos de la Finca</h4>
                  {cropsState.status === 'loading' && cropsState.farmId === selectedFarm.id && (
                    <p className="note">Cargando cultivos...</p>
                  )}
                  {cropsState.status === 'error' && cropsState.farmId === selectedFarm.id && (
                    <div className="note" role="alert">
                      <p>{cropsState.message}</p>
                      <button type="button" onClick={() => loadCrops(selectedFarm.id)}>
                        Reintentar
                      </button>
                    </div>
                  )}
                  {cropsState.status === 'success' &&
                    cropsState.farmId === selectedFarm.id &&
                    loadedCrops.length === 0 && (
                      <p className="note">Esta finca todavía no tiene cultivos registrados.</p>
                    )}
                  {loadedCrops.map((c) => (
                      <div
                        key={c.id}
                        className={`item ${selectedCrop?.id === c.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedCrop(c);
                          setActiveTab('offers');
                        }}
                      >
                        <div className="crop-media">
                          <CropImage src={c.illustrative_image_url} cropName={c.crop_name} variant="card" />
                          {c.illustrative_image_status !== 'ready' && (
                            <button
                              type="button"
                              className="crop-illustration-action"
                              disabled={illustrationState[c.id]?.status === 'pending'}
                              onClick={(event) => {
                                event.stopPropagation();
                                startIllustration(c.id);
                              }}
                            >
                              {illustrationState[c.id]?.status === 'pending' ? 'Generando imagen…' : 'Generar imagen ilustrativa'}
                            </button>
                          )}
                          {illustrationState[c.id]?.message && (
                            <p className="note" role="status">
                              {illustrationState[c.id]?.message}
                            </p>
                          )}
                        </div>
                        <div className="item-header">
                          <strong>{c.crop_name.trim()}</strong>
                        </div>
                        {c.area_hectares != null && (
                          <div className="item-detail">📐 {c.area_hectares.toFixed(2)} ha</div>
                        )}
                        {c.description && <div className="item-detail">{c.description}</div>}
                        {c.expected_harvest_at && (
                          <div className="item-detail">🗓 Cosecha esperada: {c.expected_harvest_at}</div>
                        )}
                      </div>
                    ))}
                </div>
              </>
            ) : producerLoading ? (
              <p className="note">Cargando tu registro productivo...</p>
            ) : producerError ? (
              <ProducerLinkError message={producerError} onRetry={() => setProducerAttempt((n) => n + 1)} />
            ) : farms.length === 0 ? (
              <p className="note">Aún no tienes fincas registradas. Regístralas en la pestaña Fincas.</p>
            ) : (
              <p className="note">Selecciona una finca para gestionar sus cultivos</p>
            )}
          </div>
        )}

        {/* Offers Tab: panel de gestión. Mis ofertas primero; el formulario se despliega bajo demanda */}
        {activeTab === 'offers' && canManage && (
          <div className="section offers-panel">
            <header className="offers-header">
              <h3>Gestión de ofertas</h3>
              <p className="note">Administra los productos que tienes disponibles para compradores.</p>
              <ul className="offers-summary" aria-label="Resumen de ofertas">
                <li className="offers-chip">
                  <strong>{activeOffersCount}</strong> {activeOffersCount === 1 ? 'oferta activa' : 'ofertas activas'}
                </li>
                <li className="offers-chip">
                  <strong>{myOffers.length}</strong> {myOffers.length === 1 ? 'oferta total' : 'ofertas totales'}
                </li>
              </ul>
            </header>

            {offerMessage && (
              <div className="offer-toast" role="status" aria-live="polite">
                <span>✓ {offerMessage}</span>
                <button type="button" className="offer-toast-close" aria-label="Cerrar mensaje" onClick={() => setOfferMessage(null)}>
                  ×
                </button>
              </div>
            )}

            <div ref={myOffersRef} className="offers-mine">
              <h4>Mis ofertas</h4>
              {myOffersLoading && <p className="note">Cargando tus ofertas...</p>}
              {!myOffersLoading && myOffersError && (
                <div className="note" role="alert">
                  <p>{myOffersError}</p>
                  <button type="button" onClick={() => void loadMyOffers()}>
                    Reintentar
                  </button>
                </div>
              )}
              {!myOffersLoading && !myOffersError && myOffers.length === 0 && (
                <div className="offers-empty">
                  <h5>Aún no tienes ofertas publicadas</h5>
                  <p>Publica un cultivo disponible para que compradores puedan encontrarlo en el marketplace.</p>
                  <button
                    type="button"
                    className="offers-create-btn"
                    aria-expanded={showCreateOffer}
                    aria-controls="create-offer-panel"
                    onClick={() => setShowCreateOffer(true)}
                  >
                    Crear mi primera oferta
                  </button>
                </div>
              )}
              {offerActionError && (
                <p className="note" role="alert">
                  {offerActionError}
                </p>
              )}
              {!myOffersLoading && !myOffersError && myOffers.length > 0 && (
                <div className="offers-grid">
                  {myOffers.map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      busy={offerActionId === o.id}
                      onSetStatus={(status) => void setOfferStatus(o, status)}
                      onViewMarketplace={() => navigateTo(offerPath(o.id))}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="offers-create-btn offers-toggle"
              aria-expanded={showCreateOffer}
              aria-controls="create-offer-panel"
              onClick={() => setShowCreateOffer((open) => !open)}
            >
              {showCreateOffer ? 'Ocultar formulario' : '+ Crear nueva oferta'}
            </button>

            {showCreateOffer && (
              <section id="create-offer-panel" className="offer-create-panel" aria-labelledby="create-offer-title">
                <h4 id="create-offer-title">Crear nueva oferta</h4>

                {farms.length === 0 ? (
                  producerLoading ? (
                    <p className="note">Cargando tu registro productivo...</p>
                  ) : producerError ? (
                    <ProducerLinkError message={producerError} onRetry={() => setProducerAttempt((n) => n + 1)} />
                  ) : (
                    <div className="note">
                      <p>No tienes fincas registradas. Registra una finca antes de publicar una oferta.</p>
                      <button type="button" onClick={() => setActiveTab('farms')}>
                        Ir a Fincas
                      </button>
                    </div>
                  )
                ) : (
                  <form onSubmit={handleCreateOffer} className="offer-form" noValidate>
                    <fieldset className="offer-fieldset">
                      <legend>Producto</legend>
                      <div className="offer-form-grid">
                        <div className="offer-field">
                          <label htmlFor="offer-farm">Finca</label>
                          <select
                            id="offer-farm"
                            name="farm_id"
                            value={selectedFarmId ?? ''}
                            onChange={(e) => {
                              setSelectedFarm(farms.find((f) => f.id === e.target.value) ?? null);
                              setSelectedCrop(null);
                              setOfferMessage(null);
                              setOfferError(null);
                              setOfferFieldErrors({});
                            }}
                          >
                            {!selectedFarmId && <option value="">Selecciona una finca</option>}
                            {farms.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="offer-field">
                          <label htmlFor="offer-crop">Cultivo</label>
                          {selectedFarmId && selectedCropsState?.status === 'loading' && (
                            <p className="note">Cargando cultivos...</p>
                          )}
                          {selectedFarmId && selectedCropsState?.status === 'error' && (
                            <div className="note" role="alert">
                              <p>{selectedCropsState.message}</p>
                              <button type="button" onClick={() => loadCrops(selectedFarmId)}>
                                Reintentar
                              </button>
                            </div>
                          )}
                          {selectedFarmId && selectedCropsState?.status === 'success' && selectedCropsState.crops.length === 0 && (
                            <div className="note">
                              <p>Esta finca todavía no tiene cultivos. Regístralo en la pestaña Cultivos antes de crear una oferta.</p>
                              <button type="button" onClick={() => setActiveTab('crops')}>
                                Ir a Cultivos
                              </button>
                            </div>
                          )}
                          {selectedCropsState?.status === 'success' && loadedCrops.length > 0 && (
                            <select
                              id="offer-crop"
                              name="farm_crop_id"
                              value={offerCrop?.id ?? ''}
                              aria-invalid={Boolean(offerFieldErrors.crop)}
                              aria-describedby={offerFieldErrors.crop ? 'offer-crop-error' : undefined}
                              onChange={(e) => {
                                setSelectedCrop(loadedCrops.find((c) => c.id === e.target.value) ?? null);
                                setOfferMessage(null);
                                setOfferError(null);
                              }}
                            >
                              <option value="">Selecciona un cultivo</option>
                              {loadedCrops.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.crop_name.trim()}
                                  {c.area_hectares != null ? ` · ${c.area_hectares.toFixed(2)} ha` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                          {offerFieldErrors.crop && (
                            <p id="offer-crop-error" className="field-error">
                              {offerFieldErrors.crop}
                            </p>
                          )}
                        </div>
                      </div>
                    </fieldset>

                    {offerCrop && (
                      <>
                        <fieldset className="offer-fieldset">
                          <legend>Disponibilidad</legend>
                          <div className="offer-form-grid">
                            <div className="offer-field">
                              <label htmlFor="offer-quantity">Cantidad disponible</label>
                              <input
                                id="offer-quantity"
                                name="available_quantity"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={offerForm.available_quantity}
                                aria-invalid={Boolean(offerFieldErrors.quantity)}
                                aria-describedby={offerFieldErrors.quantity ? 'offer-quantity-error' : undefined}
                                onChange={(e) => setOfferForm({ ...offerForm, available_quantity: e.target.value })}
                                required
                              />
                              {offerFieldErrors.quantity && (
                                <p id="offer-quantity-error" className="field-error">
                                  {offerFieldErrors.quantity}
                                </p>
                              )}
                            </div>
                            <div className="offer-field">
                              <label htmlFor="offer-unit">Unidad</label>
                              <select
                                id="offer-unit"
                                name="unit"
                                value={offerForm.unit}
                                onChange={(e) => setOfferForm({ ...offerForm, unit: e.target.value })}
                              >
                                <option value="kg">{unitLabel('kg')}</option>
                                <option value="ton">{unitLabel('ton')}</option>
                                <option value="units">{unitLabel('units')}</option>
                                <option value="liters">{unitLabel('liters')}</option>
                              </select>
                            </div>
                            <div className="offer-field">
                              <label htmlFor="offer-start">Disponible desde</label>
                              <input
                                id="offer-start"
                                name="availability_start"
                                type="date"
                                value={offerForm.availability_start}
                                onChange={(e) => setOfferForm({ ...offerForm, availability_start: e.target.value })}
                              />
                            </div>
                            <div className="offer-field">
                              <label htmlFor="offer-end">Disponible hasta</label>
                              <input
                                id="offer-end"
                                name="availability_end"
                                type="date"
                                value={offerForm.availability_end}
                                aria-invalid={Boolean(offerFieldErrors.availability_end)}
                                aria-describedby={offerFieldErrors.availability_end ? 'offer-end-error' : undefined}
                                onChange={(e) => setOfferForm({ ...offerForm, availability_end: e.target.value })}
                              />
                              {offerFieldErrors.availability_end && (
                                <p id="offer-end-error" className="field-error">
                                  {offerFieldErrors.availability_end}
                                </p>
                              )}
                            </div>
                          </div>
                          <p className="note">
                            La oferta aparece en el Marketplace desde su fecha de inicio (o desde hoy si no tiene).
                          </p>
                        </fieldset>

                        <fieldset className="offer-fieldset">
                          <legend>Precio y detalle</legend>
                          <div className="offer-form-grid">
                            <div className="offer-field">
                              <label htmlFor="offer-price">Precio por unidad (opcional)</label>
                              <input
                                id="offer-price"
                                name="price_per_unit"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={offerForm.price_per_unit}
                                aria-invalid={Boolean(offerFieldErrors.price)}
                                aria-describedby={offerFieldErrors.price ? 'offer-price-error' : undefined}
                                onChange={(e) => setOfferForm({ ...offerForm, price_per_unit: e.target.value })}
                              />
                              {offerFieldErrors.price && (
                                <p id="offer-price-error" className="field-error">
                                  {offerFieldErrors.price}
                                </p>
                              )}
                            </div>
                            <div className="offer-field offer-field--wide">
                              <label htmlFor="offer-description">Descripción (opcional)</label>
                              <textarea
                                id="offer-description"
                                name="description"
                                rows={3}
                                value={offerForm.description}
                                onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                              />
                            </div>
                          </div>
                        </fieldset>

                        <aside className="offer-preview" aria-label="Vista previa de la oferta">
                          <span className="offer-preview-label">Vista previa</span>
                          <strong>{offerCrop.crop_name.trim()}</strong>
                          <span>{selectedFarm?.name}</span>
                          <span>
                            {offerForm.available_quantity ? formatQuantity(parseFloat(offerForm.available_quantity), offerForm.unit) : '—'}
                            {offerForm.price_per_unit ? ` · ${formatPricePerUnit(parseFloat(offerForm.price_per_unit), offerForm.unit)}` : ''}
                          </span>
                          <span>
                            {offerForm.availability_start || offerForm.availability_end
                              ? `Disponible ${offerForm.availability_start ? formatDateShort(offerForm.availability_start) : 'desde hoy'}${offerForm.availability_end ? ` - ${formatDateShort(offerForm.availability_end)}` : ''}`
                              : 'Sin fecha definida'}
                          </span>
                        </aside>

                        <div className="offer-submit-row">
                          <button type="submit" className="offer-submit" disabled={offerSaving}>
                            {offerSaving ? 'Publicando...' : 'Publicar oferta'}
                          </button>
                        </div>
                      </>
                    )}

                    {offerError && (
                      <p className="note" role="alert">
                        {offerError}
                      </p>
                    )}
                  </form>
                )}
              </section>
            )}
          </div>
        )}

        {/* Current Offers Tab */}
        {activeTab === 'current-offer' && (
          <div className="section">
            <h3>Oferta Actual Disponible</h3>
            <p className="note">
              Mostrando {currentOffers.length} oferta{currentOffers.length !== 1 ? 's' : ''} vigente{currentOffers.length !== 1 ? 's' : ''}
            </p>

            <div className="offers-grid">
              {currentOffers.map((offer) => (
                <div key={offer.id} className="offer-card">
                  <div className="offer-header">
                    <h4>{offer.crop_name}</h4>
                    <span className="status">{offer.status}</span>
                  </div>
                  <div className="offer-body">
                    <div className="offer-line">
                      <strong>Finca:</strong> {offer.farm_name}
                    </div>
                    <div className="offer-line">
                      <strong>Productor:</strong> {offer.producer_name}
                    </div>
                    <div className="offer-line">
                      <strong>Municipio:</strong> {offer.municipality_name}
                    </div>
                    <div className="offer-line">
                      <strong>Cantidad:</strong> {formatQuantity(offer.quantity, offer.unit)}
                    </div>
                    {offer.price_per_unit && (
                      <div className="offer-line">
                        <strong>Precio:</strong> {formatPricePerUnit(offer.price_per_unit, offer.unit)}
                      </div>
                    )}
                    {offer.available_from && (
                      <div className="offer-line">
                        <strong>Disponible desde:</strong> {offer.available_from}
                      </div>
                    )}
                    {offer.available_until && (
                      <div className="offer-line">
                        <strong>Hasta:</strong> {offer.available_until}
                      </div>
                    )}
                    <div className="offer-source">
                      Fuente: <em>{offer.source}</em> ({offer.data_type})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
