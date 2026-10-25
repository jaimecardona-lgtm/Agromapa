import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentOffer } from '@/services/api';
import { MainNavigation } from '../../MainNavigation';
import { MarketplacePage } from '../MarketplacePage';
import { marketFiltersFromSearch, marketSearchFromFilters } from '../marketplaceRoutes';
import { isProducerPath, parseProducerIdFromPath, producerPath } from '../producerRoutes';

const h = vi.hoisted(() => ({
  currentOffers: { list: vi.fn() },
  territories: { getDepartments: vi.fn(), getMunicipalities: vi.fn() },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      territories: h.territories,
      operational: { ...actual.api.operational, currentOffers: h.currentOffers },
    },
  };
});

const VILLA = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';
const OTRA = '22222222-3333-4444-8555-666666666666';

function offer(id: string, farmId: string, producerId: string, crop: string): CurrentOffer {
  return {
    id,
    farm_crop_id: `crop-${id}`,
    farm_id: farmId,
    farm_name: farmId === VILLA ? 'villa carolina' : 'finca del norte',
    producer_id: producerId,
    producer_name: 'Productor',
    producer_verified: false,
    producer_contact: null,
    messaging_available: true,
    municipality_name: 'Yotoco',
    municipality_code: '76890',
    crop_name: crop,
    quantity: 10,
    unit: 'kg',
    available_from: null,
    available_until: null,
    price_per_unit: null,
    status: 'available',
    source: 'Raíces Conectadas',
    data_type: 'operational',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  } as CurrentOffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  h.territories.getDepartments.mockResolvedValue({ data: { data: [] } });
  h.territories.getMunicipalities.mockResolvedValue({ data: { data: [] } });
  h.currentOffers.list.mockResolvedValue({
    data: {
      count: 2,
      data: [offer('o1', VILLA, 'p1', 'Café'), offer('o2', OTRA, 'p2', 'Yuca')],
    },
  });
});

describe('navegación principal', () => {
  it('muestra Mercado y navega a /mercado sin sesión', async () => {
    render(<MainNavigation viewMode="map" onChange={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: /Mercado/ }));

    expect(window.location.pathname).toBe('/mercado');
  });

  it('conserva los módulos existentes', () => {
    render(<MainNavigation viewMode="map" onChange={() => undefined} />);

    for (const name of ['Mapa', 'Gestión Productiva', 'Aprende Jugando', 'Recursos']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
});

describe('rutas de productor y filtros de URL', () => {
  it('perfil: /productores/{id} con id de negocio; sin id no es perfil', () => {
    expect(isProducerPath('/productores/abc')).toBe(true);
    expect(parseProducerIdFromPath('/productores/abc')).toBe('abc');
    expect(parseProducerIdFromPath('/productores/')).toBeNull();
    expect(producerPath('abc')).toBe('/productores/abc');
  });

  it('lee filtros desde la URL', () => {
    expect(marketFiltersFromSearch('?department=76&municipality=76890&farm=F1&producer=P1&crop=café')).toEqual({
      crop: 'café',
      departmentCode: '76',
      municipalityCode: '76890',
      farmId: 'F1',
      producerId: 'P1',
    });
  });

  it('escribe solo los filtros activos y sobrevive a la ida y vuelta (F5)', () => {
    const filters = { crop: '', departmentCode: '76', municipalityCode: '76890', farmId: '', producerId: '' };
    const search = marketSearchFromFilters(filters);

    expect(search).toBe('?department=76&municipality=76890');
    expect(marketFiltersFromSearch(search)).toMatchObject({ departmentCode: '76', municipalityCode: '76890' });
    expect(marketSearchFromFilters({ ...filters, departmentCode: '', municipalityCode: '' })).toBe('');
  });

  it('?farm= en la URL limita el listado a esa finca y se ve el filtro activo', async () => {
    window.history.replaceState({}, '', `/mercado?farm=${VILLA}`);
    render(<MarketplacePage />);

    expect(await screen.findByText('Café')).toBeInTheDocument();
    expect(screen.queryByText('Yuca')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando ofertas de una finca.');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }));
    await waitFor(() => expect(screen.getByText('Yuca')).toBeInTheDocument());
    expect(window.location.search).toBe('');
  });

  it('?producer= filtra por productor', async () => {
    window.history.replaceState({}, '', '/mercado?producer=p2');
    render(<MarketplacePage />);

    expect(await screen.findByText('Yuca')).toBeInTheDocument();
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Mostrando ofertas de un productor.');
  });
});
