import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Farm, PublicProducerProfile } from '@/services/api';
import { ProducerProfilePage } from '../ProducerProfilePage';
import { FarmPopup } from '../FarmPopup';

// Contratos reales: la API responde { data } con el DTO público. Sin email, teléfono ni user_id.
const h = vi.hoisted(() => ({
  marketplace: { producer: vi.fn() },
  currentOffers: { list: vi.fn() },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      marketplace: h.marketplace,
      operational: { ...actual.api.operational, currentOffers: h.currentOffers },
    },
  };
});

const PRODUCER_ID = 'ecc689f2-777d-4844-9a91-229af7fbedf3';
const VILLA_ID = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';

const FARM: Farm = {
  id: VILLA_ID,
  name: 'villa carolina',
  producer_id: PRODUCER_ID,
  producer_name: 'Jaime Cardona',
  municipality_code: '76890',
  municipality_name: 'Yotoco',
  latitude: 3.8742,
  longitude: -76.4072,
  crops: [
    { name: 'Café', area_hectares: 1 },
    { name: 'Plátano', area_hectares: 2 },
  ],
} as Farm;

const PROFILE: PublicProducerProfile = {
  id: PRODUCER_ID,
  name: 'Jaime Cardona',
  verified: true,
  description: 'Café y frutales de Yotoco',
  department: { code: '76', name: 'Valle del Cauca' },
  municipality: { code: '76890', name: 'Yotoco' },
  farms: [FARM],
  active_offers: [
    {
      id: 'offer-cafe',
      crop_name: 'Café',
      farm_id: VILLA_ID,
      farm_name: 'villa carolina',
      municipality_code: '76890',
      municipality_name: 'Yotoco',
      quantity: 800,
      unit: 'kg',
      price_per_unit: 8000,
      available_from: '2026-10-24',
      available_until: '2026-10-28',
      status: 'available',
      description: 'cafe con alta calidad',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  h.marketplace.producer.mockResolvedValue({ data: PROFILE });
  h.currentOffers.list.mockResolvedValue({ data: { count: 0, data: [] } });
});

describe('perfil público del productor', () => {
  it('carga el productor por su id de negocio y muestra nombre, territorio y resumen', async () => {
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    expect(await screen.findByRole('heading', { name: /Jaime Cardona/ })).toBeInTheDocument();
    expect(h.marketplace.producer).toHaveBeenCalledWith(PRODUCER_ID);
    expect(screen.getByText('Yotoco, Valle del Cauca')).toBeInTheDocument();
    const summary = screen.getByRole('list', { name: 'Resumen del productor' });
    expect(within(summary).getByText('oferta disponible', { exact: false })).toBeInTheDocument();
  });

  it('muestra fincas con cultivos y su área en hectáreas', async () => {
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    const farm = await screen.findByRole('article', { name: 'Finca villa carolina' });
    const crops = within(farm).getByRole('list', { name: 'Cultivos de villa carolina' });
    expect(within(crops).getByText(/Café · 1 ha/)).toBeInTheDocument();
    expect(within(crops).getByText(/Plátano · 2 ha/)).toBeInTheDocument();
  });

  it('muestra la oferta con cantidad, unidad, precio COP y botón Ver oferta', async () => {
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    const offer = await screen.findByRole('article', { name: 'Café en villa carolina' });
    expect(within(offer).getByText('800 kg')).toBeInTheDocument();
    expect(within(offer).getByText('COP $8.000/kg')).toBeInTheDocument();
    await userEvent.click(within(offer).getByRole('button', { name: 'Ver oferta' }));
    expect(window.location.pathname).toBe('/mercado/oferta/offer-cafe');
  });

  it('"Ver en el mapa" lleva a departamento y municipio con coordenadas válidas', async () => {
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Ver en el mapa' }));

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?department=76&municipality=76890');
  });

  it('"Ver ofertas" de la finca lleva al mercado filtrado por esa finca', async () => {
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Ver ofertas' }));

    expect(window.location.pathname).toBe('/mercado');
    expect(window.location.search).toBe(`?farm=${VILLA_ID}`);
  });

  it('productor sin ofertas: estado vacío explícito, no un error', async () => {
    h.marketplace.producer.mockResolvedValue({ data: { ...PROFILE, active_offers: [] } });
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    expect(await screen.findByText('Este productor no tiene ofertas disponibles actualmente.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('finca sin cultivos públicos muestra el estado vacío de cultivos', async () => {
    h.marketplace.producer.mockResolvedValue({
      data: { ...PROFILE, farms: [{ ...FARM, crops: [] }] },
    });
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    expect(await screen.findByText('No hay cultivos públicos registrados.')).toBeInTheDocument();
  });

  it('productor inexistente o inactivo (404): "no está disponible", sin datos', async () => {
    h.marketplace.producer.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    expect(await screen.findByRole('heading', { name: 'Este productor no está disponible' })).toBeInTheDocument();
    expect(screen.queryByText('Jaime Cardona')).not.toBeInTheDocument();
  });

  it('un fallo de red no se presenta como "sin ofertas"', async () => {
    h.marketplace.producer.mockRejectedValue(new Error('network'));
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el perfil');
    expect(screen.queryByText('Este productor no tiene ofertas disponibles actualmente.')).not.toBeInTheDocument();
  });

  it('no muestra email, teléfono, WhatsApp ni identificadores de cuenta', async () => {
    h.marketplace.producer.mockResolvedValue({
      data: { ...PROFILE, user_id: 'user-secreto' } as unknown as PublicProducerProfile,
    });
    const { container } = render(<ProducerProfilePage producerId={PRODUCER_ID} />);
    await screen.findByRole('heading', { name: /Jaime Cardona/ });

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/\b3\d{9}\b/);
    expect(text).not.toContain('user-secreto');
    expect(text).not.toMatch(/whatsapp|teléfono|correo/i);
  });
});

describe('popup de finca registrada en el mapa', () => {
  it('muestra productor, cultivos y ofertas disponibles', async () => {
    h.currentOffers.list.mockResolvedValue({ data: { count: 2, data: [{ id: 'a' }, { id: 'b' }] } });
    render(<FarmPopup farm={FARM} />);

    expect(screen.getByText('villa carolina', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Jaime Cardona', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Café · 1 ha/)).toBeInTheDocument();
    expect(await screen.findByText('2 ofertas disponibles')).toBeInTheDocument();
    expect(h.currentOffers.list).toHaveBeenCalledWith({ farm_id: VILLA_ID });
  });

  it('"Ver ofertas" lleva al mercado con el filtro de la finca', async () => {
    render(<FarmPopup farm={FARM} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver ofertas' }));

    expect(window.location.pathname).toBe('/mercado');
    expect(window.location.search).toBe(`?farm=${VILLA_ID}`);
  });

  it('"Ver productor" lleva al perfil público', async () => {
    render(<FarmPopup farm={FARM} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver productor' }));

    expect(window.location.pathname).toBe(`/productores/${PRODUCER_ID}`);
  });

  it('sin ofertas: mensaje claro; con fallo: no se dice que no hay ofertas', async () => {
    h.currentOffers.list.mockResolvedValueOnce({ data: { count: 0, data: [] } });
    const { unmount } = render(<FarmPopup farm={FARM} />);
    expect(await screen.findByText('Sin ofertas disponibles actualmente.')).toBeInTheDocument();
    unmount();

    h.currentOffers.list.mockRejectedValueOnce(new Error('500'));
    render(<FarmPopup farm={FARM} />);
    expect(await screen.findByText('No pudimos consultar las ofertas.')).toBeInTheDocument();
    expect(screen.queryByText('Sin ofertas disponibles actualmente.')).not.toBeInTheDocument();
  });
});
