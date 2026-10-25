import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

const PRODUCER = { id: 'producer-1', name: 'Jaime Cardona' } as Producer;
const VILLA = { id: 'b058a6e5-687f-4449-b2bd-e1f3c1893159', name: 'villa carolina', producer_id: 'producer-1' } as Farm;
const OTRA = { id: 'farm-2', name: 'finca del norte', producer_id: 'producer-1' } as Farm;

function crop(id: string, name: string): FarmCropDetail {
  return {
    id,
    farm_id: VILLA.id,
    crop_name: name,
    description: undefined,
    area_hectares: 1,
    expected_harvest_at: undefined,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
  } as FarmCropDetail;
}

const SIX_CROPS = [
  crop('c1', 'Café'),
  crop('c2', 'cafe'),
  crop('c3', 'Plátano'),
  crop('c4', 'Mandarina'),
  crop('c5', 'Naranja'),
  crop('c6', 'caña'),
];

function renderManagement(producerRoles: string[] = ['producer']) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    roles: producerRoles as AuthContextValue['roles'],
  };
  return render(
    <AuthContext.Provider value={value}>
      <OperationalManagement />
    </AuthContext.Provider>,
  );
}

function renderManagementStrict() {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    roles: ['producer'],
  };
  return render(
    <React.StrictMode>
      <AuthContext.Provider value={value}>
        <OperationalManagement />
      </AuthContext.Provider>
    </React.StrictMode>,
  );
}

async function openFarmsTab() {
  await userEvent.click(screen.getByRole('button', { name: 'Fincas' }));
}

async function openCropsTab() {
  await userEvent.click(screen.getByRole('button', { name: 'Cultivos' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.operational.producers.linkMine.mockResolvedValue({ data: PRODUCER });
  h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA] });
  h.operational.currentOffers.list.mockResolvedValue({ data: { count: 0, data: [] } });
  h.operational.crops.list.mockResolvedValue({ data: SIX_CROPS });
});

describe('Gestión productiva: bootstrap del productor autenticado', () => {
  it('A. productor vinculado: no pide elegir productor', async () => {
    renderManagement();
    await openFarmsTab();

    expect(await screen.findByText('villa carolina')).toBeInTheDocument();
    expect(h.operational.producers.linkMine).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Selecciona un productor/)).not.toBeInTheDocument();
  });

  it('B. con una sola finca la carga automáticamente desde el productor propio', async () => {
    renderManagement();
    await openFarmsTab();

    expect(await screen.findByText('villa carolina')).toBeInTheDocument();
    expect(h.operational.farms.listByProducer).toHaveBeenCalledWith(PRODUCER.id);
  });

  it('C. con una sola finca queda seleccionada al entrar a Cultivos', async () => {
    renderManagement();
    await openFarmsTab();
    await screen.findByText('villa carolina');
    await openCropsTab();

    expect(await screen.findByRole('heading', { name: 'Gestionar Cultivos - villa carolina' })).toBeInTheDocument();
    expect(screen.queryByText(/Selecciona una finca/)).not.toBeInTheDocument();
  });

  it('D. entrar a Cultivos carga los farm_crops de esa finca y muestra los 6 existentes', async () => {
    renderManagement();
    await openFarmsTab();
    await screen.findByText('villa carolina');
    await openCropsTab();

    await waitFor(() => expect(h.operational.crops.list).toHaveBeenCalledWith(VILLA.id));
    const list = (await screen.findByText('Cultivos de la Finca')).parentElement as HTMLElement;
    await waitFor(() => expect(list.querySelectorAll('.item')).toHaveLength(6));
    expect(h.operational.crops.create).not.toHaveBeenCalled();
  });

  it('E. cambiar Fincas → Cultivos mantiene la finca seleccionada', async () => {
    h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA, OTRA] });
    renderManagement();
    await openFarmsTab();
    await userEvent.click(await screen.findByText('villa carolina'));
    await openCropsTab();
    await screen.findByRole('heading', { name: 'Gestionar Cultivos - villa carolina' });

    await openFarmsTab();
    await openCropsTab();

    expect(screen.getByRole('heading', { name: 'Gestionar Cultivos - villa carolina' })).toBeInTheDocument();
    await waitFor(() => expect(h.operational.crops.list).toHaveBeenLastCalledWith(VILLA.id));
  });

  it('con varias fincas no elige una sola sin que el usuario lo pida', async () => {
    h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA, OTRA] });
    renderManagement();
    await openFarmsTab();
    await screen.findByText('villa carolina');
    await openCropsTab();

    expect(screen.getByText('Selecciona una finca para gestionar sus cultivos')).toBeInTheDocument();
    expect(h.operational.crops.list).not.toHaveBeenCalled();
  });

  it('D2. mientras llega la respuesta de cultivos NO muestra "sin cultivos"', async () => {
    let resolveCrops!: (value: { data: FarmCropDetail[] }) => void;
    h.operational.crops.list.mockReturnValue(
      new Promise((resolve) => {
        resolveCrops = resolve;
      }),
    );
    renderManagement();
    await openFarmsTab();
    await screen.findByText('villa carolina');
    await openCropsTab();

    expect(await screen.findByText('Cargando cultivos...')).toBeInTheDocument();
    expect(screen.queryByText('Esta finca todavía no tiene cultivos registrados.')).not.toBeInTheDocument();

    await act(async () => {
      resolveCrops({ data: SIX_CROPS });
    });
    const list = (await screen.findByText('Cultivos de la Finca')).parentElement as HTMLElement;
    await waitFor(() => expect(list.querySelectorAll('.item')).toHaveLength(6));
    expect(screen.queryByText('Esta finca todavía no tiene cultivos registrados.')).not.toBeInTheDocument();
  });

  it('F. refresco: vuelve a resolver productor y finca', async () => {
    const first = renderManagement();
    await openFarmsTab();
    await screen.findByText('villa carolina');
    first.unmount();

    renderManagement();
    await openFarmsTab();
    expect(await screen.findByText('villa carolina')).toBeInTheDocument();
    expect(h.operational.producers.linkMine).toHaveBeenCalledTimes(2);
    await openCropsTab();
    expect(await screen.findByRole('heading', { name: 'Gestionar Cultivos - villa carolina' })).toBeInTheDocument();
  });

  it('H. fallo de vinculación muestra error con Reintentar, no "Selecciona un productor"', async () => {
    h.operational.producers.linkMine.mockRejectedValueOnce(new Error('500'));
    renderManagement();
    await openFarmsTab();

    expect(await screen.findByText('No pudimos cargar tu registro productivo.')).toBeInTheDocument();
    expect(screen.queryByText(/Selecciona un productor/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('villa carolina')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar tu registro productivo.')).not.toBeInTheDocument();
  });

  it('la carga de ofertas que termina después no borra el error de vinculación', async () => {
    h.operational.producers.linkMine.mockRejectedValueOnce(new Error('500'));
    let resolveOffers!: (value: { data: { count: number; data: never[] } }) => void;
    h.operational.currentOffers.list.mockReturnValue(
      new Promise((resolve) => {
        resolveOffers = resolve;
      }),
    );
    renderManagement();
    await openFarmsTab();
    await screen.findByText('No pudimos cargar tu registro productivo.');

    await act(async () => {
      resolveOffers({ data: { count: 0, data: [] } });
    });

    expect(screen.getByText('No pudimos cargar tu registro productivo.')).toBeInTheDocument();
    const section = screen.getByRole('heading', { name: 'Gestionar Fincas' }).parentElement as HTMLElement;
    expect(within(section).queryByText('villa carolina')).not.toBeInTheDocument();
  });

  it('respuesta tardía de otra finca no pisa la finca seleccionada', async () => {
    const OTRA = { id: 'farm-2', name: 'finca del norte', producer_id: 'producer-1' } as Farm;
    const OTRA_CROP = [crop('o1', 'Yuca')];
    let resolveVilla!: (value: { data: FarmCropDetail[] }) => void;
    h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA, OTRA] });
    h.operational.crops.list.mockImplementation((farmId: string) =>
      farmId === VILLA.id
        ? new Promise((resolve) => {
            resolveVilla = resolve;
          })
        : Promise.resolve({ data: OTRA_CROP }),
    );
    renderManagement();
    await openFarmsTab();
    await userEvent.click(await screen.findByText('villa carolina'));
    await openCropsTab();
    await screen.findByText('Cargando cultivos...');

    await openFarmsTab();
    await userEvent.click(await screen.findByText('finca del norte'));
    await openCropsTab();
    expect(await screen.findByText('Yuca')).toBeInTheDocument();

    await act(async () => {
      resolveVilla({ data: SIX_CROPS });
    });

    expect(screen.getByRole('heading', { name: 'Gestionar Cultivos - finca del norte' })).toBeInTheDocument();
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(screen.getByText('Yuca')).toBeInTheDocument();
  });

  it('StrictMode (doble efecto) termina mostrando los 6 cultivos', async () => {
    renderManagementStrict();
    await openFarmsTab();
    await userEvent.click(await screen.findByText('villa carolina'));
    await openCropsTab();

    const list = (await screen.findByText('Cultivos de la Finca')).parentElement as HTMLElement;
    await waitFor(() => expect(list.querySelectorAll('.item')).toHaveLength(6));
    expect(screen.queryByText('Cargando cultivos...')).not.toBeInTheDocument();
    expect(screen.queryByText('Esta finca todavía no tiene cultivos registrados.')).not.toBeInTheDocument();
  });
});

