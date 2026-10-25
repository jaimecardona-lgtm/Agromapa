import { lazy, Suspense } from 'react';
import { isAccountPath } from '@/auth/authRoutes';
import { AccountPage } from './account/AccountPage';
import { PublicGamesApp } from './public/PublicGamesApp';
import { isPublicGamesPath, usePathname } from './public/publicRoutes';
import { isMarketplacePath, isMessagesPath, parseOfferIdFromPath } from './marketplace/marketplaceRoutes';
import { MarketplacePage } from './marketplace/MarketplacePage';
import { OfferDetailPage } from './marketplace/OfferDetailPage';
import { ProducerProfilePage } from './marketplace/ProducerProfilePage';
import { isProducerPath, parseProducerIdFromPath } from './marketplace/producerRoutes';
import { MessagesPage } from './messages/MessagesPage';

// La app principal (mapa, gestión productiva) se carga solo cuando hace falta:
// las rutas públicas /juegos no descargan Leaflet ni el resto de la plataforma.
const App = lazy(() => import('../App'));

/** Elige la vista por pathname. Ninguna ruta exige sesión para navegar. */
export function AppRoot() {
  const pathname = usePathname();

  if (isPublicGamesPath(pathname)) return <PublicGamesApp />;
  if (isAccountPath(pathname)) return <AccountPage />;
  if (isMessagesPath(pathname)) return <MessagesPage />;
  if (isProducerPath(pathname)) {
    const producerId = parseProducerIdFromPath(pathname);
    return producerId ? <ProducerProfilePage producerId={producerId} /> : <MarketplacePage />;
  }
  if (isMarketplacePath(pathname)) {
    const offerId = parseOfferIdFromPath(pathname);
    return offerId ? <OfferDetailPage offerId={offerId} /> : <MarketplacePage />;
  }

  return (
    <Suspense fallback={<div className="app-loading">Cargando Raíces Conectadas...</div>}>
      <App />
    </Suspense>
  );
}
