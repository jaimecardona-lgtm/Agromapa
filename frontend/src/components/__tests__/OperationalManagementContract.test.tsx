import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { api, apiClient } from '@/services/api';
import { OperationalManagement } from '../OperationalManagement';

// Contrato real: la capa HTTP de api.ts (axios) se ejecuta tal cual.
// Solo se reemplaza el transporte: el cuerpo JSON devuelto es el que la API real envía (arrays directos).
const VILLA_ID = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';
const PRODUCER = { id: 'producer-1', name: 'Jaime Cardona' };
const VILLA = { id: VILLA_ID, name: 'villa carolina', producer_id: 'producer-1' };
const SIX_CROPS = ['Café', 'cafe', 'Plátano', 'Mandarina', 'Naranja', 'caña'].map((name, i) => ({
  id: `c${i + 1}`,
  farm_id: VILLA_ID,
  crop_name: name,
  area_hectares: 1,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
}));

const requested: string[] = [];

const transport: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const url = config.url ?? '';
  const method = (config.method ?? 'get').toLowerCase();
  requested.push(`${method.toUpperCase()} ${url}`);
  let body: unknown;
  if (method === 'post' && url.endsWith('/api/operational/producers')) body = PRODUCER;
  else if (url.endsWith('/api/operational/producers/producer-1/farms')) body = [VILLA];
  else if (url.endsWith(`/api/operational/farms/${VILLA_ID}/crops`) && method === 'get') body = SIX_CROPS;
  else if (url.endsWith('/api/operational/current-offer')) body = { count: 0, data: [] };
  else throw new Error(`ruta no simulada: ${method} ${url}`);
  return { data: body, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config };
};

let originalAdapter: typeof apiClient.defaults.adapter;
beforeAll(() => {
  originalAdapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = transport;
});
afterAll(() => {
  apiClient.defaults.adapter = originalAdapter;
});

describe('contrato real de api.operational.crops.list', () => {
  it('axios devuelve la respuesta completa; el array vive en res.data (length 6)', async () => {
    const res = await api.operational.crops.list(VILLA_ID);

    expect(Array.isArray(res)).toBe(false);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data).toHaveLength(6);
    expect(res.data.map((c) => c.crop_name)).toEqual(['Café', 'cafe', 'Plátano', 'Mandarina', 'Naranja', 'caña']);
  });

  it('OperationalManagement con la capa api real renderiza los 6 cultivos', async () => {
    requested.length = 0;
    const value: AuthContextValue = {
      ...defaultAuthValue,
      configured: true,
      status: 'authenticated',
      user: { id: 'user-1', email: 'productor@example.com' },
      roles: ['producer'],
    };
    render(
      <AuthContext.Provider value={value}>
        <OperationalManagement />
      </AuthContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Fincas' }));
    await userEvent.click(await screen.findByText('villa carolina'));
    await userEvent.click(screen.getByRole('button', { name: 'Cultivos' }));

    const list = (await screen.findByText('Cultivos de la Finca')).parentElement as HTMLElement;
    await waitFor(() => expect(list.querySelectorAll('.item')).toHaveLength(6));
    expect(screen.queryByText('Esta finca todavía no tiene cultivos registrados.')).not.toBeInTheDocument();
    expect(requested.filter((r) => r.endsWith(`/api/operational/farms/${VILLA_ID}/crops`))).toHaveLength(1);
  });
});
