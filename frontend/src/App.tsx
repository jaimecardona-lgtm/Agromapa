import { useEffect, useState, useMemo } from 'react';
import { api, GeoUnit, AgriculturalData, Farm, HealthStatus, AgriculturalCrop } from '@/services/api';
import { Map, groupCrops, getCropEmoji, GroupedCrop } from '@/components/Map';
import { StatusPanel } from '@/components/StatusPanel';
import { AgentPanel } from '@/components/AgentPanel';
import './App.css';

type NavigationLevel = 'country' | 'department' | 'municipality';

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [currentLevel, setCurrentLevel] = useState<NavigationLevel>('country');
  const [departments, setDepartments] = useState<GeoUnit[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<GeoUnit | null>(null);
  const [municipalities, setMunicipalities] = useState<GeoUnit[]>([]);
  const [selectedMunicipality, setSelectedMunicipality] = useState<GeoUnit | null>(null);
  const [agriculturalData, setAgriculturalData] = useState<AgriculturalData | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [munSearchFilter, setMunSearchFilter] = useState('');
  const [expandedCrops, setExpandedCrops] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'info' | 'agent'>('info');

  // Check health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api.health.check();
        setHealth(res.data);
      } catch (err) {
        console.error('Health check failed:', err);
      }
    };
    checkHealth();
  }, []);

  // Load departments on mount
  useEffect(() => {
    const loadDepartments = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.territories.getDepartments();
        if (res.data.data && res.data.data.length > 0) {
          setDepartments(res.data.data);
        } else {
          setError('No geographic data found. Run: python -m app.jobs.sync_upra_geo');
        }
      } catch (err) {
        setError('Failed to load geographic data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadDepartments();
  }, []);

  const handleDepartmentClick = async (dept: GeoUnit) => {
    setSelectedDepartment(dept);
    setSelectedMunicipality(null);
    setAgriculturalData(null);
    setFarms([]);
    setCurrentLevel('department');
    setMunSearchFilter('');
    setLoading(true);
    setError(null);

    try {
      const res = await api.territories.getMunicipalities(dept.dane_code);
      if (res.data.data) {
        setMunicipalities(res.data.data);
      }
    } catch (err) {
      setError(`Failed to load municipalities for ${dept.name}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleMunicipalityClick = async (mun: GeoUnit) => {
    setSelectedMunicipality(mun);
    setCurrentLevel('municipality');
    setDataLoading(true);
    setExpandedCrops({});

    try {
      // 1. Fetch real EVA agricultural data (independent of farms)
      const agRes = await api.agriculture.getMunicipality(mun.dane_code, 2024);
      setAgriculturalData(agRes.data.data || null);

      // 2. Fetch farms (empty farms does NOT break or hide map/EVA)
      const farmsRes = await api.farms.getByMunicipality(mun.dane_code);
      setFarms(farmsRes.data.data || []);
    } catch (err) {
      console.error('Failed to load municipality data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleBack = () => {
    if (currentLevel === 'municipality') {
      setCurrentLevel('department');
      setSelectedMunicipality(null);
      setAgriculturalData(null);
      setFarms([]);
      setExpandedCrops({});
    } else if (currentLevel === 'department') {
      setCurrentLevel('country');
      setSelectedDepartment(null);
      setMunicipalities([]);
      setMunSearchFilter('');
    }
  };

  const toggleCropExpand = (cropName: string) => {
    setExpandedCrops((prev) => ({
      ...prev,
      [cropName]: !prev[cropName],
    }));
  };

  // Grouped crops for the side panel
  const groupedCrops: GroupedCrop[] = useMemo(() => {
    if (!agriculturalData?.crops) return [];
    return groupCrops(agriculturalData.crops);
  }, [agriculturalData]);

  // Is selected municipality geometry pending? (e.g. DANE 27493 Nuevo Belén de Bajirá)
  const isGeometryPending = Boolean(
    selectedMunicipality && selectedMunicipality.geojson === null,
  );

  // Active territorial features according to navigation level:
  // - country: departments
  // - department: municipalities of department
  // - municipality with geometry: [selectedMunicipality]
  // - municipality WITHOUT geometry (27493): retain department municipalities
  const territorialFeatures = useMemo(() => {
    if (currentLevel === 'country') return departments;
    if (currentLevel === 'department') return municipalities;
    if (currentLevel === 'municipality') {
      if (selectedMunicipality?.geojson) {
        return [selectedMunicipality];
      }
      // If geometry is NULL, retain municipalities of the previous context
      return municipalities;
    }
    return departments;
  }, [currentLevel, departments, municipalities, selectedMunicipality]);

  const mapClickHandler = (feature: GeoUnit) => {
    if (currentLevel === 'country') {
      handleDepartmentClick(feature);
    } else if (currentLevel === 'department') {
      handleMunicipalityClick(feature);
    }
  };

  // Filtered municipalities for department search list
  const filteredMunicipalities = useMemo(() => {
    if (!munSearchFilter.trim()) return municipalities;
    const term = munSearchFilter.toLowerCase();
    return municipalities.filter(
      (m) =>
        m.name.toLowerCase().includes(term) || m.dane_code.includes(term),
    );
  }, [municipalities, munSearchFilter]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>🗺️ AgroMapa Colombia</h1>
            <p>Explorador territorial agroproductivo oficial — UPRA & EVA 2024</p>
          </div>
          {health && (
            <div className="header-badge">
              <span className="status-dot"></span>
              API v{health.version}
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        {/* Breadcrumbs Navigation */}
        <nav className="breadcrumbs" aria-label="Navegación territorial">
          <button
            onClick={() => {
              setCurrentLevel('country');
              setSelectedDepartment(null);
              setSelectedMunicipality(null);
              setMunicipalities([]);
              setAgriculturalData(null);
              setFarms([]);
            }}
            disabled={currentLevel === 'country'}
            className="breadcrumb-btn"
          >
            🇨🇴 Colombia
          </button>

          {selectedDepartment && (
            <>
              <span className="breadcrumb-separator">›</span>
              <button
                onClick={() => {
                  setCurrentLevel('department');
                  setSelectedMunicipality(null);
                  setAgriculturalData(null);
                  setFarms([]);
                }}
                disabled={currentLevel === 'department'}
                className="breadcrumb-btn"
              >
                {selectedDepartment.name}
              </button>
            </>
          )}

          {selectedMunicipality && (
            <>
              <span className="breadcrumb-separator">›</span>
              <span className="breadcrumb-current">
                {selectedMunicipality.name}
                <span className="dane-tag">DANE {selectedMunicipality.dane_code}</span>
              </span>
            </>
          )}

          {currentLevel !== 'country' && (
            <button onClick={handleBack} className="back-nav-btn" title="Subir un nivel">
              ← Volver
            </button>
          )}
        </nav>

        {/* Main Content: Map + Side Panel */}
        <div className="content-container">
          {/* Map Section */}
          <div className="map-section">
            {error ? (
              <div className="error-box">{error}</div>
            ) : loading ? (
              <div className="loading-box">
                <span className="spinner"></span> Cargando territorio...
              </div>
            ) : (
              <Map
                territorialFeatures={territorialFeatures}
                selectedMunicipality={selectedMunicipality}
                agriculturalData={agriculturalData}
                farms={farms}
                onFeatureClick={mapClickHandler}
                geometryPending={isGeometryPending}
              />
            )}
          </div>

          {/* Side Panel */}
          <aside className="side-panel">
            {/* 1. MUNICIPALITY SELECTED: TABS */}
            {selectedMunicipality && (
              <>
                {/* Tab Navigation */}
                <div className="panel-tabs">
                  <button
                    className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                    onClick={() => setActiveTab('info')}
                  >
                    📊 Información
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'agent' ? 'active' : ''}`}
                    onClick={() => setActiveTab('agent')}
                  >
                    🤖 Agente
                  </button>
                </div>

                {/* TAB: INFORMACIÓN */}
                {activeTab === 'info' && (
                  <>
                    {/* Pending Geometry Warning Banner */}
                    {isGeometryPending && (
                      <div className="notice-banner warning">
                        <div className="notice-icon">⚠️</div>
                        <div className="notice-text">
                          <strong>Geometría oficial pendiente de integración</strong>
                          <p>
                            El municipio {selectedMunicipality.name} (DANE {selectedMunicipality.dane_code})
                            no cuenta con polígono cartográfico oficial en la fuente UPRA. Los datos
                            estadísticos agrícolas se vinculan por código DANE oficial.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Agricultural Panel (EVA 2024) */}
                    <section className="panel-section">
                      <div className="section-header">
                        <h3>🌾 Información Agrícola</h3>
                        <span className="source-tag">EVA 2024</span>
                      </div>

                      {dataLoading ? (
                        <div className="panel-loading">Cargando estadísticas EVA...</div>
                      ) : agriculturalData ? (
                        <div className="agriculture-panel">
                      <div className="ag-header">
                        <h4>{agriculturalData.municipality.name}</h4>
                        <p className="ag-code">Código DANE: {agriculturalData.municipality.dane_code}</p>
                        <div className="ag-meta-row">
                          <span><strong>Fuente:</strong> {agriculturalData.source.name}</span>
                          <span><strong>Año:</strong> {agriculturalData.year}</span>
                        </div>
                      </div>

                      {/* Municipal Summary KPIs */}
                      <div className="ag-summary-kpis">
                        <div className="kpi-card">
                          <span className="kpi-num">{groupedCrops.length}</span>
                          <span className="kpi-label">Cultivos reportados</span>
                        </div>
                        <div className="kpi-card">
                          <span className="kpi-num">
                            {(agriculturalData.total_area_planted_ha || 0).toLocaleString()}
                          </span>
                          <span className="kpi-label">Área sembrada (ha)</span>
                        </div>
                        <div className="kpi-card">
                          <span className="kpi-num">
                            {(agriculturalData.total_area_harvested_ha || 0).toLocaleString()}
                          </span>
                          <span className="kpi-label">Área cosechada (ha)</span>
                        </div>
                        <div className="kpi-card">
                          <span className="kpi-num">
                            {(agriculturalData.total_production_tons || 0).toLocaleString()}
                          </span>
                          <span className="kpi-label">Producción (t)</span>
                        </div>
                      </div>

                      {/* Grouped Crops List */}
                      {groupedCrops.length > 0 ? (
                        <div className="crops-list">
                          <div className="crops-list-header">
                            <h5>Cultivos Municipales ({groupedCrops.length})</h5>
                            <span className="crops-records-badge">
                              {agriculturalData.crops.length} registros
                            </span>
                          </div>

                          <div className="crops-container">
                            {groupedCrops.map((crop) => {
                              const isExpanded = Boolean(expandedCrops[crop.crop_name]);
                              const emoji = getCropEmoji(crop.crop_name);
                              const hasMultiple = crop.records.length > 1;

                              return (
                                <div key={crop.crop_name} className="crop-card">
                                  <div className="crop-card-main">
                                    <div className="crop-title-row">
                                      <span className="crop-emoji">{emoji}</span>
                                      <span className="crop-name">{crop.crop_name}</span>
                                      {crop.crop_group && (
                                        <span className="crop-group-pill">{crop.crop_group}</span>
                                      )}
                                    </div>

                                    <div className="crop-metrics-grid">
                                      <div className="metric">
                                        <span className="m-label">Sembrada:</span>
                                        <span className="m-val">{crop.total_planted_ha.toLocaleString()} ha</span>
                                      </div>
                                      <div className="metric">
                                        <span className="m-label">Cosechada:</span>
                                        <span className="m-val">{crop.total_harvested_ha.toLocaleString()} ha</span>
                                      </div>
                                      <div className="metric">
                                        <span className="m-label">Producción:</span>
                                        <span className="m-val">{crop.total_production_tons.toLocaleString()} t</span>
                                      </div>
                                      {crop.total_harvested_ha > 0 && (
                                        <div className="metric">
                                          <span className="m-label">Rendimiento:</span>
                                          <span className="m-val">
                                            {(crop.total_production_tons / crop.total_harvested_ha).toFixed(2)} t/ha
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Toggle for multiple periods/variations */}
                                    {hasMultiple && (
                                      <button
                                        type="button"
                                        onClick={() => toggleCropExpand(crop.crop_name)}
                                        className="crop-details-toggle"
                                      >
                                        {isExpanded ? '▲ Ocultar detalle' : `▼ Ver periodos y variantes (${crop.records.length})`}
                                      </button>
                                    )}
                                  </div>

                                  {/* Detailed Breakdown */}
                                  {hasMultiple && isExpanded && (
                                    <div className="crop-details-table">
                                      {crop.records.map((rec: AgriculturalCrop, idx: number) => (
                                        <div key={idx} className="crop-record-row">
                                          <div className="record-header">
                                            <span className="record-period">{rec.period || 'Anual'}</span>
                                            {rec.crop_cycle && (
                                              <span className="record-cycle">{rec.crop_cycle}</span>
                                            )}
                                            {rec.crop_disaggregation && (
                                              <span className="record-disagg">{rec.crop_disaggregation}</span>
                                            )}
                                          </div>
                                          <div className="record-stats">
                                            <span>Sembrada: {(rec.area_planted_ha || 0).toLocaleString()} ha</span>
                                            <span>Producción: {(rec.production_tons || 0).toLocaleString()} t</span>
                                            {rec.yield_t_ha && <span>Rend: {rec.yield_t_ha.toFixed(2)} t/ha</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="no-data">No se reportaron cultivos en EVA 2024 para este municipio.</p>
                      )}
                    </div>
                  ) : (
                    <p className="no-data">No se encontraron datos agrícolas para este municipio</p>
                  )}
                </section>

                {/* Farms Panel (Independent of EVA) */}
                <section className="panel-section">
                  <div className="section-header">
                    <h3>🏡 Fincas Registradas</h3>
                    <span className="farms-badge-count">{farms.length}</span>
                  </div>

                  {farms && farms.length > 0 ? (
                    <div className="farms-list">
                      <p className="farms-summary-text">
                        {farms.length} finca(s) registradas en AgroMapa para este municipio.
                      </p>
                      {farms.map((farm) => (
                        <div key={farm.id} className="farm-card">
                          <div className="farm-card-header">
                            <h5>{farm.name}</h5>
                            {farm.verified && <span className="verified-badge">✓ Verificada</span>}
                          </div>
                          {farm.producer_name && (
                            <p className="farm-producer">Productor: {farm.producer_name}</p>
                          )}
                          {farm.description && <p className="farm-desc">{farm.description}</p>}
                          {farm.crops && farm.crops.length > 0 && (
                            <div className="farm-crops-chips">
                              {farm.crops.map((c) => (
                                <span key={c.id} className="farm-crop-chip">
                                  {c.crop_name} {c.area_hectares ? `(${c.area_hectares} ha)` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-farms-box">
                      <p className="no-data">No hay fincas registradas en AgroMapa para este municipio.</p>
                      <span className="empty-farms-hint">
                        La ausencia de fincas no afecta los datos agrícolas oficiales de EVA.
                      </span>
                    </div>
                  )}
                </section>

                    {/* 3. SYSTEM STATUS - IN INFO TAB */}
                    <section className="panel-section status-section">
                      <h3>⚙️ Estado del Sistema</h3>
                      <StatusPanel health={health} loading={loading} />
                    </section>
                  </>
                )}

                {/* TAB: AGENTE */}
                {activeTab === 'agent' && (
                  <div className="agent-panel-wrapper">
                    <AgentPanel
                      departmentCode={selectedDepartment?.dane_code}
                      municipalityCode={selectedMunicipality.dane_code}
                      municipalityName={selectedMunicipality.name}
                    />
                  </div>
                )}
              </>
            )}

            {/* 2. DEPARTMENT SELECTED: MUNICIPALITY SELECTOR */}
            {currentLevel === 'department' && selectedDepartment && (
              <section className="panel-section">
                <div className="section-header">
                  <h3>🏛️ Municipios de {selectedDepartment.name}</h3>
                  <span className="badge-count">{municipalities.length}</span>
                </div>
                <p className="section-subtitle">
                  Seleccione un municipio en el mapa o en la lista a continuación:
                </p>

                <div className="mun-search-box">
                  <input
                    type="text"
                    placeholder="Buscar municipio o código DANE..."
                    value={munSearchFilter}
                    onChange={(e) => setMunSearchFilter(e.target.value)}
                    className="mun-search-input"
                  />
                  {munSearchFilter && (
                    <button onClick={() => setMunSearchFilter('')} className="clear-search-btn">
                      ✕
                    </button>
                  )}
                </div>

                <div className="municipalities-scroll-list">
                  {filteredMunicipalities.map((mun) => (
                    <button
                      key={mun.dane_code}
                      onClick={() => handleMunicipalityClick(mun)}
                      className={`municipality-list-item ${mun.geojson === null ? 'no-geom-item' : ''}`}
                    >
                      <div className="mun-item-name">{mun.name}</div>
                      <div className="mun-item-meta">
                        <span className="mun-dane">DANE {mun.dane_code}</span>
                        {mun.geojson === null && (
                          <span className="pending-geom-pill" title="Geometría oficial pendiente">
                            Geom. pendiente
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {filteredMunicipalities.length === 0 && (
                    <p className="no-data">No se encontraron municipios con ese criterio.</p>
                  )}
                </div>
              </section>
            )}

          </aside>
        </div>
      </main>

      <footer className="app-footer">
        <p>AgroMapa Colombia © 2026 — Datos oficiales UPRA & Evaluaciones Agropecuarias Municipales (EVA 2024)</p>
      </footer>
    </div>
  );
}

export default App;
