// Token de acceso de la sesión actual, solo en memoria. Lo escribe AuthProvider
// y lo lee el interceptor de Axios. No se guarda en storage adicional.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}
