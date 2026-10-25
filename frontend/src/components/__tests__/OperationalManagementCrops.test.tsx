import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { Farm, FarmCropDetail, Producer } from '@/services/api';
import { OperationalManagement } from '../OperationalManagement';

const h = vi.hoisted(() => ({
  operational: {
    producers: { linkMine: vi.fn() },
    farms: { listByProducer: vi.fn() },
    crops: { list: vi.fn(), create: vi.fn(), illustration: vi.fn(async () => ({ data: { farm_crop_id: 'x', status: 'failed', image_url: null, label: null, message: 'Generación de imágenes no configurada.' } })) },
    currentOffers: { list: vi.fn() },
  },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { ...actual.api, operational: h.operational } };
});

const PRODUCER = { id: 'producer-1', name: 'Ana Pérez' } as Producer;
const VILLA = { id: 'b058a6e5-687f-4449-b2bd-e1f3c1893159', name: 'villa carolina', producer_id: 'producer-1' } as Farm;

function crop(id: string, name: string, extra: Partial<FarmCropDetail> = {}): FarmCropDetail {
  return {
    id,
    farm_id: VILLA.id,
    crop_name: name,
    description: undefined,
    area_hectares: 1,
    expected_harvest_at: undefined,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
    ...extra,
  };
}

const SIX_CROPS = [
  crop('c1', 'caña'),
  crop('c2', 'Naranja'),
  crop('c3', 'Mandarina'),
  crop('c4', 'Plátano', { area_hectares: 2, description: 'Lote norte', expected_harvest_at: '2027-03-01' }),
  crop('c5', 'cafe'),
  crop('c6', 'Café'),
];

function renderManagement() {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'jaime@example.com' },
    roles: ['producer'],
  };
  render(
    <AuthContext.Provider value={value}>
      <OperationalManagement />
    </AuthContext.Provider>,
  );
}

async function openVillaCropsTab() {
  await userEvent.click(await screen.findByRole('button', { name: 'Fincas' }));
  await userEvent.click(await screen.findByText('villa carolina'));
  await screen.findByRole('heading', { name: /Gestionar Cultivos/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.operational.producers.linkMine.mockResolvedValue({ data: PRODUCER });
  h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA] });
  h.operational.currentOffers.list.mockResolvedValue({ data: { count: 0, data: [] } });
  h.operational.crops.list.mockResolvedValue({ data: SIX_CROPS });
});

describe('Cultivos de la finca: lectura desde la API', () => {
  it('al seleccionar la finca carga sus cultivos y los renderiza con crop_name', async () => {
    renderManagement();
    await openVillaCropsTab();

    expect(h.operational.crops.list).toHaveBeenCalledWith(VILLA.id);
    for (const name of ['caña', 'Naranja', 'Mandarina', 'Plátano', 'cafe', 'Café']) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
    const list = screen.getByText('Cultivos de la Finca').parentElement as HTMLElement;
    expect(list.querySelectorAll('.item')).toHaveLength(6);
  });

  it('muestra área, descripción y cosecha cuando existen', async () => {
    renderManagement();
    await openVillaCropsTab();

    const platano = (await screen.findByText('Plátano')).closest('.item') as HTMLElement;
    expect(within(platano).getByText('📐 2.00 ha')).toBeInTheDocument();
    expect(within(platano).getByText('Lote norte')).toBeInTheDocument();
    expect(within(platano).getByText(/Cosecha esperada: 2027-03-01/)).toBeInTheDocument();
  });

  it('description y expected_harvest_at nulos no rompen el render', async () => {
    h.operational.crops.list.mockResolvedValue({ data: [crop('c1', 'caña', { description: undefined, expected_harvest_at: undefined })] });
    renderManagement();
    await openVillaCropsTab();

    expect(await screen.findByText('caña')).toBeInTheDocument();
    expect(screen.queryByText(/Cosecha esperada/)).not.toBeInTheDocument();
  });

  it('lista realmente vacía muestra el estado vacío explícito', async () => {
    h.operational.crops.list.mockResolvedValue({ data: [] });
    renderManagement();
    await openVillaCropsTab();

    expect(await screen.findByText('Esta finca todavía no tiene cultivos registrados.')).toBeInTheDocument();
  });

  it('mientras carga muestra "Cargando cultivos..."', async () => {
    let resolve: (value: { data: FarmCropDetail[] }) => void = () => undefined;
    h.operational.crops.list.mockReturnValue(new Promise((r) => (resolve = r)));
    renderManagement();
    await openVillaCropsTab();

    expect(screen.getByText('Cargando cultivos...')).toBeInTheDocument();
    resolve({ data: SIX_CROPS });
    expect(await screen.findByText('caña')).toBeInTheDocument();
  });

  it('si la API falla muestra error con Reintentar y recupera la lista', async () => {
    h.operational.crops.list.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({ data: SIX_CROPS });
    renderManagement();
    await openVillaCropsTab();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los cultivos.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('caña')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('volver a abrir la pestaña vuelve a leer desde la API (no depende del estado local)', async () => {
    renderManagement();
    await openVillaCropsTab();
    await screen.findByText('caña');

    h.operational.crops.list.mockResolvedValue({ data: [crop('c9', 'Aguacate', { area_hectares: 1 })] });
    await userEvent.click(screen.getByRole('button', { name: 'Ofertas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cultivos' }));

    expect(await screen.findByText('Aguacate')).toBeInTheDocument();
    expect(screen.queryByText('caña')).not.toBeInTheDocument();
  });
});

describe('Cultivos de la finca: creación', () => {
  it('crear exitosamente recarga la lista y limpia el formulario', async () => {
    h.operational.crops.create.mockResolvedValue({ data: crop('c7', 'Aguacate') });
    h.operational.crops.list
      .mockResolvedValueOnce({ data: SIX_CROPS })
      .mockResolvedValueOnce({ data: [...SIX_CROPS, crop('c7', 'Aguacate')] });
    renderManagement();
    await openVillaCropsTab();
    await screen.findByText('caña');

    await userEvent.type(screen.getByLabelText('Nombre del cultivo'), '  Aguacate  ');
    await userEvent.type(screen.getByLabelText('Área en hectáreas'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Cultivo' }));

    await waitFor(() => expect(h.operational.crops.create).toHaveBeenCalledTimes(1));
    expect(h.operational.crops.create.mock.calls[0][1]).toMatchObject({ crop_name: 'Aguacate', area_hectares: 1 });
    expect(await screen.findByText('Aguacate')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del cultivo')).toHaveValue('');
  });

  it('si la creación falla conserva lo escrito en el formulario', async () => {
    h.operational.crops.create.mockRejectedValue(new Error('400'));
    renderManagement();
    await openVillaCropsTab();
    await screen.findByText('caña');

    await userEvent.type(screen.getByLabelText('Nombre del cultivo'), 'Aguacate');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Cultivo' }));

    await waitFor(() => expect(h.operational.crops.create).toHaveBeenCalled());
    expect(screen.getByLabelText('Nombre del cultivo')).toHaveValue('Aguacate');
  });

  it('un nombre solo con espacios no se envía', async () => {
    renderManagement();
    await openVillaCropsTab();
    await screen.findByText('caña');

    await userEvent.type(screen.getByLabelText('Nombre del cultivo'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Cultivo' }));

    expect(h.operational.crops.create).not.toHaveBeenCalled();
  });

  it('avisa si el nombre ya existe en la finca, ignorando tildes y mayúsculas', async () => {
    renderManagement();
    await openVillaCropsTab();
    await screen.findByText('caña');

    await userEvent.type(screen.getByLabelText('Nombre del cultivo'), 'CAFE');
    expect(screen.getByRole('status')).toHaveTextContent('Ya hay un cultivo con este nombre en la finca.');
  });

  it('los campos del formulario tienen id, name y etiqueta accesible', async () => {
    renderManagement();
    await openVillaCropsTab();

    const name = screen.getByLabelText('Nombre del cultivo');
    expect(name).toHaveAttribute('id', 'crop-name');
    expect(name).toHaveAttribute('name', 'crop_name');
    expect(screen.getByLabelText('Área en hectáreas')).toHaveAttribute('name', 'area_hectares');
  });
});
