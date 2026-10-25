import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { OperationalManagement } from '@/components/OperationalManagement';
import { CropImage, IllustrationDisclaimer, ILLUSTRATION_DISCLAIMER } from '../CropImage';

// Contratos reales: respuestas axios con `data`. Generación de imagen: POST .../illustration.
const h = vi.hoisted(() => ({
  operational: {
    producers: { linkMine: vi.fn() },
    farms: { listByProducer: vi.fn() },
    crops: { list: vi.fn(), create: vi.fn(), illustration: vi.fn() },
    offers: { create: vi.fn() },
    currentOffers: { list: vi.fn() },
  },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { ...actual.api, operational: h.operational } };
});

const VILLA_ID = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';
const VILLA = { id: VILLA_ID, name: 'villa carolina', producer_id: 'producer-1' };
const CAFE_URL = 'https://storage.example/crop-illustrations/farm-crops/c1/v1.webp';

function crop(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    farm_id: VILLA_ID,
    crop_name: name,
    area_hectares: 1,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
    illustrative_image_url: null,
    illustrative_image_status: 'none',
    ...extra,
  };
}

function renderManagement() {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    roles: ['producer'],
  };
  return render(
    <AuthContext.Provider value={value}>
      <OperationalManagement />
    </AuthContext.Provider>,
  );
}

async function openCropsTab() {
  await userEvent.click(await screen.findByRole('button', { name: 'Fincas' }));
  await userEvent.click(await screen.findByText('villa carolina'));
  await screen.findByRole('heading', { name: /Gestionar Cultivos/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.operational.producers.linkMine.mockResolvedValue({ data: { id: 'producer-1', name: 'Jaime Cardona' } });
  h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA] });
  h.operational.currentOffers.list.mockResolvedValue({ data: { count: 0, data: [] } });
  h.operational.crops.list.mockResolvedValue({ data: [crop('c1', 'Café', { illustrative_image_url: CAFE_URL, illustrative_image_status: 'ready' }), crop('c2', 'Plátano')] });
  h.operational.crops.illustration.mockResolvedValue({ data: { farm_crop_id: 'c2', status: 'failed', image_url: null, label: null, message: 'Generación de imágenes no configurada.' } });
});

describe('CropImage: lazy, etiquetada y con placeholder', () => {
  it('sin URL: placeholder agrícola propio y ninguna imagen rota', () => {
    const { container } = render(<CropImage src={null} cropName="Plátano" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.crop-image--placeholder')).toHaveTextContent('P');
  });

  it('con URL: img lazy, alt descriptivo y badge de imagen IA', () => {
    render(<CropImage src={CAFE_URL} cropName="Café" variant="card" />);

    const img = screen.getByRole('img', { name: 'Ilustración de Café' });
    expect(img).toHaveAttribute('src', CAFE_URL);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(screen.getByText('Imagen ilustrativa IA')).toBeInTheDocument();
  });

  it('si la imagen no carga: vuelve al placeholder, no muestra una caja rota', () => {
    const { container } = render(<CropImage src={CAFE_URL} cropName="Café" />);

    fireEvent.error(screen.getByRole('img', { name: 'Ilustración de Café' }));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.crop-image--placeholder')).not.toBeNull();
  });

  it('en el detalle la etiqueta es la completa y el disclaimer está disponible', () => {
    render(
      <>
        <CropImage src={CAFE_URL} cropName="Café" variant="hero" />
        <IllustrationDisclaimer />
      </>,
    );

    expect(screen.getByText('Imagen ilustrativa generada por IA')).toBeInTheDocument();
    expect(screen.getByText(ILLUSTRATION_DISCLAIMER)).toBeInTheDocument();
  });
});

describe('cultivos: imagen en la tarjeta y generación solo del productor', () => {
  it('cultivo con imagen lista muestra la imagen y no ofrece generar otra', async () => {
    renderManagement();
    await openCropsTab();

    const cafe = (await screen.findByText('Café')).closest('.item') as HTMLElement;
    expect(within(cafe).getByRole('img', { name: 'Ilustración de Café' })).toHaveAttribute('src', CAFE_URL);
    expect(within(cafe).queryByRole('button', { name: 'Generar imagen ilustrativa' })).not.toBeInTheDocument();
  });

  it('cultivo sin imagen: placeholder y botón para generar', async () => {
    renderManagement();
    await openCropsTab();

    const platano = (await screen.findByText('Plátano')).closest('.item') as HTMLElement;
    expect(within(platano).queryByRole('img')).toBeNull();
    expect(within(platano).getByRole('button', { name: 'Generar imagen ilustrativa' })).toBeInTheDocument();
  });

  it('proveedor no configurado: mensaje claro y el cultivo sigue usable', async () => {
    renderManagement();
    await openCropsTab();

    const platano = (await screen.findByText('Plátano')).closest('.item') as HTMLElement;
    await userEvent.click(within(platano).getByRole('button', { name: 'Generar imagen ilustrativa' }));

    expect(await screen.findByText('Generación de imágenes no configurada.')).toBeInTheDocument();
    expect(h.operational.crops.illustration).toHaveBeenCalledWith('c2');
    expect(screen.getByText('Plátano')).toBeInTheDocument();
    expect(screen.getByText('Café')).toBeInTheDocument();
  });

  it('un error de red al generar no rompe la lista ni borra el cultivo', async () => {
    h.operational.crops.illustration.mockRejectedValueOnce(new Error('network'));
    renderManagement();
    await openCropsTab();

    const platano = (await screen.findByText('Plátano')).closest('.item') as HTMLElement;
    await userEvent.click(within(platano).getByRole('button', { name: 'Generar imagen ilustrativa' }));

    expect(await screen.findByText('No pudimos generar la imagen. Puedes intentarlo de nuevo.')).toBeInTheDocument();
    expect(screen.getByText('Plátano')).toBeInTheDocument();
    expect(h.operational.crops.list).toHaveBeenCalledTimes(1); // sin reintentos automáticos ni recarga
  });

  it('crear un cultivo dispara la imagen sin bloquear: el cultivo aparece aunque la imagen falle', async () => {
    h.operational.crops.create.mockResolvedValue({ data: crop('c9', 'Aguacate') });
    h.operational.crops.list
      .mockResolvedValueOnce({ data: [crop('c1', 'Café', { illustrative_image_url: CAFE_URL, illustrative_image_status: 'ready' })] })
      .mockResolvedValue({ data: [crop('c1', 'Café', { illustrative_image_url: CAFE_URL, illustrative_image_status: 'ready' }), crop('c9', 'Aguacate')] });
    h.operational.crops.illustration.mockRejectedValueOnce(new Error('503'));
    renderManagement();
    await openCropsTab();

    await userEvent.type(screen.getByLabelText('Nombre del cultivo'), 'Aguacate');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Cultivo' }));

    await waitFor(() => expect(h.operational.crops.illustration).toHaveBeenCalledWith('c9'));
    expect(await screen.findByText('Aguacate')).toBeInTheDocument();
  });
});
