// Ruta de la cuenta. La app principal no usa router: se distingue por pathname.
export const ACCOUNT_PATH = '/cuenta';

export function isAccountPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === ACCOUNT_PATH;
}
