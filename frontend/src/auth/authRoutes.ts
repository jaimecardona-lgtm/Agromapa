// Ruta de la cuenta. La app principal no usa router: se distingue por pathname.
export const ACCOUNT_PATH = '/cuenta';

export function isAccountPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === ACCOUNT_PATH;
}

// Ruta a la que volver tras iniciar sesión o activar el rol comprador (p. ej. la oferta
// desde la que se pidió "Contactar productor"). Vive en sessionStorage; nunca contiene datos.
const RETURN_PATH_KEY = 'raices-return-path';

export function rememberReturnPath(path: string): void {
  try {
    window.sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // Sin sessionStorage el usuario vuelve a la oferta manualmente.
  }
}

/** Lee y borra la ruta de regreso. Solo acepta rutas internas que empiecen por "/". */
export function takeReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_PATH_KEY);
    window.sessionStorage.removeItem(RETURN_PATH_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

// Vista de gestión productiva dentro de "/" (la app principal no usa router). Se reconoce por
// query para que un inicio de sesión que recarga la página vuelva a esa misma sección.
export const PRODUCTIVE_RETURN_PATH = '/?vista=gestion';

export function isProductiveViewRequested(search: string): boolean {
  return new URLSearchParams(search).get('vista') === 'gestion';
}

/** Destino tras registrarse: ruta pendiente; si no, por rol (comprador -> mercado; resto -> cuenta). */
export function postSignupPath(choice: 'producer' | 'buyer' | 'both'): string {
  return takeReturnPath() ?? (choice === 'buyer' ? '/mercado' : ACCOUNT_PATH);
}
