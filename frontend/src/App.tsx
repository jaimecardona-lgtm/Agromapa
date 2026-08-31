import { useEffect, useState } from 'react';
import { api, GeoUnit, AgriculturalData, Farm, HealthStatus } from '@/services/api';
import { Map } from '@/components/Map';
import { StatusPanel } from '@/components/StatusPanel';
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
  const [error, setError] = useState<string | null>(null);

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
    setCurrentLevel('department');
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
    setLoading(true);
    setError(null);

    try {
      // Get agriculture data
      const agRes = await api.agriculture.getMunicipality(mun.dane_code, 2024);
      setAgriculturalData(agRes.data.data);

      // Get farms
      const farmsRes = await api.farms.getByMunicipality(mun.dane_code);
      setFarms(farmsRes.data.data || []);
    } catch (err) {
      console.error('Failed to load municipality data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentLevel === 'municipality') {
      setCurrentLevel('department');
      setSelectedMunicipality(null);
      setAgriculturalData(null);
      setFarms([]);
    } else if (currentLevel === 'department') {
      setCurrentLevel('country');
      setSelectedDepartment(null);
      setMunicipalities([]);
    }
  };

  const mapFeatures = (() => {
    if (currentLevel === 'country') return departments;
    if (currentLevel === 'department') return municipalities;
    return [];
  })();

  const mapClickHandler = (feature: GeoUnit) => {
    if (currentLevel === 'country') {
      handleDepartmentClick(feature);
    } else if (currentLevel === 'department') {
      handleMunicipalityClick(feature);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🗺️ AgroMapa Colombia</h1>
          <p>Explorador territorial agroproductivo</p>
        </div>
      </header>

      <main className="app-main">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          <button onClick={() => handleBack()} disabled={currentLevel === 'country'} className="breadcrumb-btn">
            Colombia
          </button>

          {selectedDepartment && (
            <>
              <span> › </span>
              <button
                onClick={() => handleBack()}
                disabled={currentLevel === 'country'}
                className="breadcrumb-btn"
              >
                {selectedDepartment.name}
              </button>
            </>
          )}

          {selectedMunicipality && (
            <>
              <span> › </span>
              <span className="breadcrumb-current">{selectedMunicipality.name}</span>
            </>
          )}
        </div>

        {/* Main content */}
        <div className="content-container">
          {/* Map */}
          <div className="map-section">
            {error && <div className="error-box">{error}</div>}
            {!error && mapFeatures.length > 0 ? (
              <Map features={mapFeatures} onFeatureClick={mapClickHandler} />
            ) : (
              <div className="loading-box">
                {loading ? 'Cargando...' : 'Sin datos geográficos disponibles'}
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="side-panel">
            {/* System Status */}
            <section className="panel-section">
              <h3>Estado del Sistema</h3>
              <StatusPanel health={health} loading={loading} />
            </section>

            {/* Agriculture Data */}
            {selectedMunicipality && agriculturalData && (
              <section className="panel-section">
                <h3>Información Agrícola</h3>
                <div className="agriculture-panel">
                  <div className="ag-header">
                    <h4>{agriculturalData.municipality.name}</h4>
                    <p className="ag-code">DANE: {agriculturalData.municipality.dane_code}</p>
                  </div>

                  <div className="ag-source">
                    <strong>Fuente:</strong> {agriculturalData.source.name} {agriculturalData.year}
                  </div>

                  {agriculturalData.crops && agriculturalData.crops.length > 0 ? (
                    <div className="crops-list">
                      <h5>Cultivos ({agriculturalData.crops.length})</h5>
                      <div className="crops-container">
                        {agriculturalData.crops.map((crop, idx) => (
                          <div key={idx} className="crop-item">
                            <strong>{crop.crop_name}</strong>
                            {crop.area_planted_ha && (
                              <p>Área sembrada: {crop.area_planted_ha.toLocaleString()} ha</p>
                            )}
                            {crop.production_tons && (
                              <p>Producción: {crop.production_tons.toLocaleString()} t</p>
                            )}
                            {crop.yield_t_ha && <p>Rendimiento: {crop.yield_t_ha.toFixed(2)} t/ha</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="no-data">No se encontraron datos agrícolas para este municipio</p>
                  )}
                </div>
              </section>
            )}

            {/* Farms */}
            {selectedMunicipality && (
              <section className="panel-section">
                <h3>Fincas Registradas</h3>
                {farms && farms.length > 0 ? (
                  <div className="farms-list">
                    <p className="farms-count">{farms.length} finca(s) registrada(s)</p>
                    {farms.map((farm) => (
                      <div key={farm.id} className="farm-item">
                        <h5>{farm.name}</h5>
                        {farm.description && <p>{farm.description}</p>}
                        <p className="farm-location">
                          {farm.description ? '' : selectedMunicipality.name}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-data">No hay fincas registradas en AgroMapa para este municipio</p>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>AgroMapa Colombia © 2026 - Datos reales de fuentes oficiales</p>
      </footer>
    </div>
  );
}

export default App;
