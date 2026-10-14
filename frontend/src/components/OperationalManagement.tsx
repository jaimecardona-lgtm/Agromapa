import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { api, Producer, Farm, FarmCropDetail, CurrentOffer } from '@/services/api';
import { useAuth } from '@/auth/AuthContext';
import { ProducerGate } from '@/components/auth/ProducerGate';
import '../styles/OperationalManagement.css';

type Tab = 'producers' | 'farms' | 'crops' | 'offers' | 'current-offer';

// Pestañas de escritura productiva: requieren cuenta con rol productor.
const PRODUCTIVE_TABS: Tab[] = ['producers', 'farms', 'crops', 'offers'];

export function OperationalManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('producers');
  const { status, roles } = useAuth();
  const canManage = status === 'authenticated' && roles.includes('producer');
  const [farms, setFarms] = useState<Farm[]>([]);
  const [crops, setCrops] = useState<FarmCropDetail[]>([]);
  const [currentOffers, setCurrentOffers] = useState<CurrentOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forms state
  const [selectedProducer, setSelectedProducer] = useState<Producer | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<FarmCropDetail | null>(null);

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

  const [offerForm, setOfferForm] = useState({
    available_quantity: '',
    unit: 'kg',
    availability_start: '',
    availability_end: '',
    price_per_unit: '',
    description: '',
  });

  // Load data
  useEffect(() => {
    loadCurrentOffers();
  }, []);

  // El productor es el de la cuenta (vínculo por token), nunca uno elegido de una lista.
  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;

    api.operational.producers
      .linkMine()
      .then(async (res) => {
        if (cancelled) return;
        setSelectedProducer(res.data);
        const farmsRes = await api.operational.farms.listByProducer(res.data.id);
        if (!cancelled) setFarms(farmsRes.data);
      })
      .catch((err) => {
        if (!cancelled) setError('No pudimos cargar tu registro productivo.');
        console.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage]);

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

  async function loadCropsByFarm(farmId: string) {
    try {
      setLoading(true);
      const res = await api.operational.crops.list(farmId);
      setCrops(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load crops');
      console.error(err);
    } finally {
      setLoading(false);
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
  async function handleCreateCrop(e: FormEvent) {
    e.preventDefault();
    if (!selectedFarm) {
      setError('Select a farm first');
      return;
    }

    try {
      setLoading(true);
      await api.operational.crops.create(selectedFarm.id, {
        crop_name: cropForm.crop_name,
        area_hectares: cropForm.area_hectares ? parseFloat(cropForm.area_hectares) : undefined,
        description: cropForm.description,
      });
      setCropForm({ crop_name: '', area_hectares: '', description: '', variety: '' });
      await loadCropsByFarm(selectedFarm.id);
      setError(null);
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
    if (!selectedCrop) {
      setError('Select a crop first');
      return;
    }

    try {
      setLoading(true);
      await api.operational.offers.create(selectedCrop.id, {
        available_quantity: parseFloat(offerForm.available_quantity),
        unit: offerForm.unit,
        availability_start: offerForm.availability_start,
        availability_end: offerForm.availability_end,
        price_per_unit: offerForm.price_per_unit ? parseFloat(offerForm.price_per_unit) : undefined,
        description: offerForm.description,
      });
      setOfferForm({ available_quantity: '', unit: 'kg', availability_start: '', availability_end: '', price_per_unit: '', description: '' });
      await loadCurrentOffers();
      setError(null);
    } catch (err) {
      setError('Failed to create offer');
      console.error(err);
    } finally {
      setLoading(false);
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
                  <input
                    type="text"
                    placeholder="Nombre de la finca"
                    value={farmForm.name}
                    onChange={(e) => setFarmForm({ ...farmForm, name: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Código municipio (DANE)"
                    value={farmForm.municipality_code}
                    onChange={(e) => setFarmForm({ ...farmForm, municipality_code: e.target.value })}
                    required
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input
                      type="number"
                      placeholder="Latitud"
                      step="0.000001"
                      value={farmForm.latitude}
                      onChange={(e) => setFarmForm({ ...farmForm, latitude: e.target.value })}
                      required
                    />
                    <input
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
                  <input
                    type="number"
                    placeholder="Área (hectáreas)"
                    step="0.01"
                    value={farmForm.area_ha}
                    onChange={(e) => setFarmForm({ ...farmForm, area_ha: e.target.value })}
                  />
                  <textarea
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
                        loadCropsByFarm(f.id);
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
            ) : (
              <p className="note">Selecciona un productor para gestionar sus fincas</p>
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
                    type="text"
                    placeholder="Nombre del cultivo"
                    value={cropForm.crop_name}
                    onChange={(e) => setCropForm({ ...cropForm, crop_name: e.target.value })}
                    required
                  />
                  {/* Variety not in current schema */}
                  <input
                    type="text"
                    placeholder="Variedad (opcional)"
                    value={cropForm.variety}
                    onChange={(e) => setCropForm({ ...cropForm, variety: e.target.value })}
                  />
                  <input
                    type="number"
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
                  {crops.map((c) => (
                    <div
                      key={c.id}
                      className={`item ${selectedCrop?.id === c.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedCrop(c);
                        setActiveTab('offers');
                      }}
                    >
                      <div className="item-header">
                        <strong>{c.crop_name}</strong>
                      </div>
                      {/* c.variety not in current schema */}
                      {c.area_hectares && <div className="item-detail">📐 {c.area_hectares} ha</div>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="note">Selecciona una finca para gestionar sus cultivos</p>
            )}
          </div>
        )}

        {/* Offers Tab */}
        {activeTab === 'offers' && canManage && (
          <div className="section">
            <h3>Crear Oferta {selectedCrop && `- ${selectedCrop.crop_name}`}</h3>

            {selectedCrop ? (
              <form onSubmit={handleCreateOffer} className="form">
                <input
                  type="number"
                  placeholder="Cantidad"
                  step="0.01"
                  value={offerForm.available_quantity}
                  onChange={(e) => setOfferForm({ ...offerForm, available_quantity: e.target.value })}
                  required
                />
                <select
                  value={offerForm.unit}
                  onChange={(e) => setOfferForm({ ...offerForm, unit: e.target.value })}
                >
                  <option value="kg">kg</option>
                  <option value="ton">ton</option>
                  <option value="units">unidades</option>
                  <option value="liters">litros</option>
                </select>
                <input
                  type="date"
                  placeholder="Disponible desde"
                  value={offerForm.availability_start}
                  onChange={(e) => setOfferForm({ ...offerForm, availability_start: e.target.value })}
                />
                <input
                  type="date"
                  placeholder="Disponible hasta"
                  value={offerForm.availability_end}
                  onChange={(e) => setOfferForm({ ...offerForm, availability_end: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Precio por unidad"
                  step="0.01"
                  value={offerForm.price_per_unit}
                  onChange={(e) => setOfferForm({ ...offerForm, price_per_unit: e.target.value })}
                />
                <textarea
                  placeholder="Descripción de la oferta"
                  value={offerForm.description}
                  onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Creando...' : 'Crear Oferta'}
                </button>
              </form>
            ) : (
              <p className="note">Selecciona un cultivo para crear una oferta</p>
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
                      <strong>Cantidad:</strong> {offer.quantity} {offer.unit}
                    </div>
                    {offer.price_per_unit && (
                      <div className="offer-line">
                        <strong>Precio:</strong> ${offer.price_per_unit.toFixed(2)}
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
