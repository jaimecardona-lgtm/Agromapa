import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentOffer, Farm, PublicProducerProfile } from '@/services/api';
import { ILLUSTRATION_DISCLAIMER } from '@/components/operational/CropImage';
import { FarmPopup } from '../FarmPopup';
import { MarketplacePage } from '../MarketplacePage';
import { OfferDetailPage } from '../OfferDetailPage';
import { ProducerProfilePage } from '../ProducerProfilePage';

// Una sola URL por cultivo: Marketplace, detalle, perfil y mapa la reutilizan. Nada se regenera aquí.
const h = vi.hoisted(() => ({
  currentOffers: { list: vi.fn(), get: vi.fn() },
  marketplace: { producer: vi.fn() },
  territories: { getDepartments: vi.fn(), getMunicipalities: vi.fn() },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      territories: h.territories,
      marketplace: h.marketplace,
      operational: { ...actual.api.operational, currentOffers: h.currentOffers },
    },
  };
});

const CAFE_URL = 'https://storage.example/crop-illustrations/farm-crops/c1/v1.webp';
const PRODUCER_ID = 'ecc689f2-777d-4844-9a91-229af7fbedf3';
const VILLA_ID = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';

const OFFER = {
  id: 'offer-cafe',
  farm_crop_id: 'c1',
  farm_id: VILLA_ID,
  farm_name: 'villa carolina',
  producer_id: PRODUCER_ID,
  producer_name: 'Jaime Cardona',
  producer_verified: false,
  producer_contact: null,
  messaging_available: true,
  municipality_name: 'Yotoco',
  municipality_code: '76890',
  crop_name: 'Café',
  crop_image_url: CAFE_URL,
  quantity: 800,
  unit: 'kg',
  available_from: null,
  available_until: null,
  price_per_unit: 8000,
  status: 'available',
  source: 'Raíces Conectadas',
  data_type: 'operational',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
} as unknown as CurrentOffer;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  h.territories.getDepartments.mockResolvedValue({ data: { data: [] } });
  h.territories.getMunicipalities.mockResolvedValue({ data: { data: [] } });
  h.currentOffers.list.mockResolvedValue({ data: { count: 1, data: [OFFER] } });
  h.currentOffers.get.mockResolvedValue({ data: OFFER });
});

describe('Marketplace reutiliza la ilustración del cultivo', () => {
  it('la tarjeta usa la misma URL y su badge de IA', async () => {
    render(<MarketplacePage />);

    const card = (await screen.findByRole('article', { name: 'Café en villa carolina' })) as HTMLElement;
    expect(within(card).getByRole('img', { name: 'Ilustración de Café' })).toHaveAttribute('src', CAFE_URL);
    expect(within(card).getByText('Imagen ilustrativa IA')).toBeInTheDocument();
  });

  it('una oferta sin imagen sigue visible con placeholder', async () => {
    h.currentOffers.list.mockResolvedValue({ data: { count: 1, data: [{ ...OFFER, crop_image_url: null }] } });
    const { container } = render(<MarketplacePage />);

    const card = (await screen.findByRole('article', { name: 'Café en villa carolina' })) as HTMLElement;
    expect(within(card).getByText('Café', { selector: 'h3' })).toBeInTheDocument();
    expect(container.querySelector('.crop-image--placeholder')).not.toBeNull();
  });
});

describe('detalle de oferta', () => {
  it('imagen grande con el disclaimer de IA; la compra/contacto sigue visible', async () => {
    render(<OfferDetailPage offerId="offer-cafe" />);

    expect(await screen.findByRole('img', { name: 'Ilustración de Café' })).toHaveAttribute('src', CAFE_URL);
    expect(screen.getByText(ILLUSTRATION_DISCLAIMER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver perfil del productor' })).toBeInTheDocument();
  });

  it('sin imagen: placeholder, sin disclaimer, y la oferta sigue usable', async () => {
    h.currentOffers.get.mockResolvedValue({ data: { ...OFFER, crop_image_url: null } });
    const { container } = render(<OfferDetailPage offerId="offer-cafe" />);

    expect(await screen.findByRole('heading', { name: 'Café' })).toBeInTheDocument();
    expect(container.querySelector('.crop-image--placeholder')).not.toBeNull();
    expect(screen.queryByText(ILLUSTRATION_DISCLAIMER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver perfil del productor' })).toBeInTheDocument();
  });
});

describe('perfil del productor reutiliza la misma ilustración', () => {
  it('la oferta del perfil usa la URL del cultivo, sin copia nueva', async () => {
    const profile: PublicProducerProfile = {
      id: PRODUCER_ID,
      name: 'Jaime Cardona',
      verified: false,
      description: null,
      department: { code: '76', name: 'Valle del Cauca' },
      municipality: { code: '76890', name: 'Yotoco' },
      farms: [] as Farm[],
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
          available_from: null,
          available_until: null,
          status: 'available',
          description: null,
          crop_image_url: CAFE_URL,
        },
      ],
    };
    h.marketplace.producer.mockResolvedValue({ data: profile });
    render(<ProducerProfilePage producerId={PRODUCER_ID} />);

    const tile = (await screen.findByRole('article', { name: 'Café en villa carolina' })) as HTMLElement;
    expect(within(tile).getByRole('img', { name: 'Ilustración de Café' })).toHaveAttribute('src', CAFE_URL);
  });
});

describe('popup del mapa: miniatura solo si ya existe URL, en lazy', () => {
  it('miniatura lazy del cultivo con imagen; sin miniatura cuando no existe', async () => {
    const farm = {
      id: VILLA_ID,
      name: 'villa carolina',
      producer_id: PRODUCER_ID,
      producer_name: 'Jaime Cardona',
      municipality_name: 'Yotoco',
      latitude: 3.8,
      longitude: -76.4,
      crops: [
        { name: 'Café', area_hectares: 1, image_url: CAFE_URL },
        { name: 'Plátano', area_hectares: 2, image_url: null },
      ],
    } as unknown as Farm;
    const { container } = render(<FarmPopup farm={farm} />);

    const thumbs = container.querySelectorAll('img.farm-popup-thumb');
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0]).toHaveAttribute('src', CAFE_URL);
    expect(thumbs[0]).toHaveAttribute('loading', 'lazy');
    expect(h.currentOffers.list).toHaveBeenCalledWith({ farm_id: VILLA_ID });
  });
});
