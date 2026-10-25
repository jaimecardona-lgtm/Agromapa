import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue } from '@/auth/AuthContext';
import type { CurrentOffer } from '@/services/api';
import { MarketplacePage, applyClientFilters, DEFAULT_FILTERS } from '../MarketplacePage';

// La carga con filtro tiene una pausa de 250 ms; con la suite en paralelo conviene más margen.
configure({ asyncUtilTimeout: 4000 });

const h = vi.hoisted(() => ({
  api: {
    territories: {
      getDepartments: vi.fn(),
      getMunicipalities: vi.fn(),
    },
    operational: {
      currentOffers: {
        list: vi.fn(),
      },
    },
  },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: h.api };
});

function offer(overrides: Partial<CurrentOffer>): CurrentOffer {
  return {
    id: 'offer-cafe',
    farm_crop_id: 'crop-1',
    farm_id: 'farm-1',
    farm_name: 'Finca La Esperanza',
    producer_id: 'producer-1',
    producer_name: 'Ana Pérez',
    producer_verified: true,
    producer_contact: null,
    messaging_available: true,
    municipality_name: 'Dagua',
    municipality_code: '76109',
    crop_name: 'Café',
    quantity: 120,
    unit: 'kg',
    available_from: '2020-01-01',
    available_until: '2099-12-31',
    price_per_unit: 9000,
    status: 'available',
    source: 'Raíces Conectadas',
    data_type: 'operational',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    ...overrides,
  } as CurrentOffer;
}

const CAFE = offer({});
const CACAO_VENCIDO = offer({
  id: 'offer-cacao',
  crop_name: 'Cacao',
  quantity: 5,
  available_until: '2020-01-31',
  producer_contact: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/mercado');
  h.api.territories.getDepartments.mockResolvedValue({ data: { data: [{ dane_code: '76', name: 'Valle del Cauca' }] } });
  h.api.territories.getMunicipalities.mockResolvedValue({ data: { data: [] } });
  h.api.operational.currentOffers.list.mockResolvedValue({ data: { count: 2, data: [CAFE, CACAO_VENCIDO] } });
});

function renderMarket() {
  render(
    <AuthContext.Provider value={{ ...defaultAuthValue }}>
      <MarketplacePage />
    </AuthContext.Provider>,
  );
}

describe('MarketplacePage (público)', () => {
  it('muestra ofertas vigentes sin necesitar sesión y oculta las vencidas por defecto', async () => {
    renderMarket();

    expect(await screen.findByRole('heading', { name: 'Café' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cacao' })).not.toBeInTheDocument();
    expect(screen.getByText('120 kg')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(h.api.operational.currentOffers.list).toHaveBeenCalled();
  });

  it('no muestra datos de contacto cuando producer_contact es null', async () => {
    h.api.operational.currentOffers.list.mockResolvedValue({
      data: { count: 1, data: [offer({ producer_contact: null })] },
    });
    renderMarket();

    await screen.findByRole('heading', { name: 'Café' });
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+?\d{7,}/)).not.toBeInTheDocument();
  });

  it('envía el cultivo escrito al servidor', async () => {
    renderMarket();
    await screen.findByRole('heading', { name: 'Café' });

    await userEvent.type(screen.getByRole('searchbox'), 'caf');

    await waitFor(() =>
      expect(h.api.operational.currentOffers.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ crop: 'caf' }),
      ),
    );
  });

  it('filtra por cantidad mínima en el cliente', async () => {
    renderMarket();
    await screen.findByRole('heading', { name: 'Café' });

    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cantidad mínima' }), '500');

    expect(await screen.findByText('No hay ofertas vigentes con estos filtros.')).toBeInTheDocument();
  });

  it('permite ver también las ofertas vencidas al desmarcar "Solo disponibles hoy"', async () => {
    renderMarket();
    await screen.findByRole('heading', { name: 'Café' });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Solo disponibles hoy' }));

    expect(await screen.findByRole('heading', { name: 'Cacao' })).toBeInTheDocument();
  });

  it('muestra error si la lista no carga', async () => {
    h.api.operational.currentOffers.list.mockRejectedValue(new Error('network'));
    renderMarket();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las ofertas');
  });
});

describe('applyClientFilters', () => {
  const today = new Date('2026-10-23T12:00:00');

  it('ordena por disponibilidad dejando sin fecha final al final', () => {
    const sorted = applyClientFilters(
      [
        offer({ id: 'a', available_until: null, crop_name: 'Sin fecha' }),
        offer({ id: 'b', available_until: '2099-06-01', crop_name: 'Lejana' }),
        offer({ id: 'c', available_until: '2099-01-01', crop_name: 'Cercana' }),
      ],
      { ...DEFAULT_FILTERS, sort: 'availability' },
      today,
    );
    expect(sorted.map((o) => o.crop_name)).toEqual(['Cercana', 'Lejana', 'Sin fecha']);
  });
});
