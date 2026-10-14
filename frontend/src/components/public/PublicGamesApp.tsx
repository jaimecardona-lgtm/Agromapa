import { useEffect } from 'react';
import { findGame } from '../games/catalog';
import type { GameSlug } from '@/services/gameScores';
import { AccountMenu } from '../auth/AccountMenu';
import { PortalPage } from './PortalPage';
import { PORTAL_PATH, navigateTo, parsePublicRoute, usePathname } from './publicRoutes';
import '../styles/PublicGames.css';

/** Entrada de las rutas públicas /juegos... Sin mapa ni gestión productiva. */
export function PublicGamesApp() {
  const pathname = usePathname();
  const route = parsePublicRoute(pathname);

  useEffect(() => {
    // Rutas /juegos/... desconocidas vuelven al portal sin dejar historial extra.
    if (route.kind === 'unknown') {
      window.history.replaceState({}, '', PORTAL_PATH);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [route.kind]);

  return (
    <div className="public-games">
      <header className="public-header">
        <a
          className="public-brand"
          href={PORTAL_PATH}
          onClick={(event) => {
            event.preventDefault();
            navigateTo(PORTAL_PATH);
          }}
        >
          <span className="public-brand-name">RAÍCES CONECTADAS</span>
          <span className="public-brand-tag">Aprende jugando</span>
        </a>
        <div className="public-header-actions">
          <a className="public-platform-link" href="/">Plataforma</a>
          <AccountMenu />
        </div>
      </header>

      {route.kind === 'game' ? <GameStage slug={route.slug} /> : <PortalPage />}
    </div>
  );
}

function GameStage({ slug }: { slug: GameSlug }) {
  const game = findGame(slug);
  if (!game) return null;
  const { Component, title } = game;

  return (
    <main className="public-stage" aria-label={title}>
      <nav className="public-stage-nav">
        <a
          href={PORTAL_PATH}
          onClick={(event) => {
            event.preventDefault();
            navigateTo(PORTAL_PATH);
          }}
        >
          ← Portal de juegos
        </a>
      </nav>
      <div className="public-stage-body">
        <Component onQuit={() => navigateTo(PORTAL_PATH)} />
      </div>
    </main>
  );
}
