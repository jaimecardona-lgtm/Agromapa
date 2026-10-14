import { lazy, Suspense } from 'react';
import { isAccountPath } from '@/auth/authRoutes';
import { AccountPage } from './account/AccountPage';
import { PublicGamesApp } from './public/PublicGamesApp';
import { isPublicGamesPath, usePathname } from './public/publicRoutes';

// La app principal (mapa, gestión productiva) se carga solo cuando hace falta:
// las rutas públicas /juegos no descargan Leaflet ni el resto de la plataforma.
const App = lazy(() => import('../App'));

/** Elige la vista por pathname. Ninguna ruta exige sesión para navegar. */
export function AppRoot() {
  const pathname = usePathname();

  if (isPublicGamesPath(pathname)) return <PublicGamesApp />;
  if (isAccountPath(pathname)) return <AccountPage />;

  return (
    <Suspense fallback={<div className="app-loading">Cargando Raíces Conectadas...</div>}>
      <App />
    </Suspense>
  );
}
