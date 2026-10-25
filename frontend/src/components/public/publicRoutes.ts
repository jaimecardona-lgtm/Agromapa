import { useEffect, useState } from 'react';
import type { GameSlug } from '@/services/gameScores';

// Enrutado mínimo para las rutas públicas de juegos. La app principal no usa
// router: solo se distingue por pathname. Sin dependencias nuevas.

export const PORTAL_PATH = '/juegos';
export const RANKING_PATH = '/juegos/ranking';

export type PublicRoute = { kind: 'portal' } | { kind: 'ranking' } | { kind: 'game'; slug: GameSlug } | { kind: 'unknown' };

const GAME_SLUGS: GameSlug[] = ['cosechas', 'eco-puzzle', 'cazadores-residuos'];

export function isPublicGamesPath(pathname: string): boolean {
  return pathname === PORTAL_PATH || pathname === `${PORTAL_PATH}/` || pathname.startsWith(`${PORTAL_PATH}/`);
}

export function parsePublicRoute(pathname: string): PublicRoute {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized === PORTAL_PATH || normalized === '') return { kind: 'portal' };
  if (normalized === RANKING_PATH) return { kind: 'ranking' };
  const slug = normalized.slice(PORTAL_PATH.length + 1) as GameSlug;
  if (normalized.startsWith(`${PORTAL_PATH}/`) && GAME_SLUGS.includes(slug)) {
    return { kind: 'game', slug };
  }
  return { kind: 'unknown' };
}

export function gamePath(slug: GameSlug): string {
  return `${PORTAL_PATH}/${slug}`;
}

export function navigateTo(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Ruta actual; se actualiza con back/forward y con navigateTo. */
export function usePathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  return pathname;
}
