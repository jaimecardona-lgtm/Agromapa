import { MARKETPLACE_PATH } from './marketplace/marketplaceRoutes';
import { navigateTo } from './public/publicRoutes';

export type ViewMode = 'map' | 'operational' | 'games' | 'resources';

interface MainNavigationProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/** Navegación principal. Mercado es una ruta pública: explorar no exige sesión. */
export function MainNavigation({ viewMode, onChange }: MainNavigationProps) {
  return (
    <div className="view-mode-toggle">
      <button
        className={`view-btn ${viewMode === 'map' ? 'active' : ''}`}
        onClick={() => onChange('map')}
        title="Ver mapa territorial"
      >
        🗺️ Mapa
      </button>
      <button
        type="button"
        className="view-btn"
        onClick={() => navigateTo(MARKETPLACE_PATH)}
        title="Explorar ofertas productivas vigentes"
      >
        🛒 Mercado
      </button>
      <button
        className={`view-btn ${viewMode === 'operational' ? 'active' : ''}`}
        onClick={() => onChange('operational')}
        title="Gestionar productores, fincas y ofertas"
      >
        🌾 Gestión Productiva
      </button>
      <button
        className={`view-btn ${viewMode === 'games' ? 'active' : ''}`}
        onClick={() => onChange('games')}
        title="Aprende jugando con minijuegos educativos"
      >
        🎮 Aprende Jugando
      </button>
      <button
        className={`view-btn ${viewMode === 'resources' ? 'active' : ''}`}
        onClick={() => onChange('resources')}
        title="Accede a materiales educativos"
      >
        📚 Recursos
      </button>
    </div>
  );
}
