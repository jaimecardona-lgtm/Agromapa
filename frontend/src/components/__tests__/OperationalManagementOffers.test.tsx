import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { BusinessRole } from '@/services/identity';
import { OperationalManagement } from '../OperationalManagement';

// Contratos reales: api.* y identityApi.* devuelven respuestas de axios, con el cuerpo en `data`.
const h = vi.hoisted(() => ({
  operational: {
    producers: { linkMine: vi.fn() },
    farms: { listByProducer: vi.fn() },
    crops: { list: vi.fn(), create: vi.fn(), illustration: vi.fn(async () => ({ data: { farm_crop_id: 'x', status: 'failed', image_url: null, label: null, message: 'Generación de imágenes no configurada.' } })) },
    offers: { create: vi.fn(), update: vi.fn() },
    currentOffers: { list: vi.fn() },
  },
  identity: { myOffers: vi.fn() },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { ...actual.api, operational: h.operational } };
});

vi.mock('@/services/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/identity')>();
  return { ...actual, identityApi: h.identity };
});

const VILLA_ID = 'b058a6e5-687f-4449-b2bd-e1f3c1893159';
const OTRA_ID = 'farm-2';
const VILLA = { id: VILLA_ID, name: 'villa carolina', producer_id: 'producer-1' };
const OTRA = { id: OTRA_ID, name: 'finca del norte', producer_id: 'producer-1' };
const SIX_NAMES = ['Café', 'cafe', 'Plátano', 'Mandarina', 'Naranja', 'caña'];

function cropsFor(farmId: string, names: string[]) {
  return names.map((name, i) => ({
    id: `${farmId}-c${i + 1}`,
    farm_id: farmId,
    crop_name: name,
    area_hectares: 1,
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
  }));
}

function renderOffers(roles: BusinessRole[] = ['producer']) {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    roles,
  };
  return render(
    <AuthContext.Provider value={value}>
      <OperationalManagement />
    </AuthContext.Provider>,
  );
}

async function openOffersTab() {
  await userEvent.click(screen.getByRole('button', { name: 'Ofertas' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.operational.producers.linkMine.mockResolvedValue({ data: { id: 'producer-1', name: 'Jaime Cardona' } });
  h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA] });
  h.operational.crops.list.mockImplementation(async (farmId: string) => ({
    data: farmId === VILLA_ID ? cropsFor(VILLA_ID, SIX_NAMES) : cropsFor(farmId, ['Yuca']),
  }));
  h.operational.offers.create.mockResolvedValue({ data: { id: 'offer-1' } });
  h.operational.currentOffers.list.mockResolvedValue({ data: { count: 0, data: [] } });
  h.identity.myOffers.mockResolvedValue({ data: [] });
});

describe('Ofertas: selección real de finca y cultivo', () => {
  it('1. productor con 0 fincas: mensaje y acción para registrar una finca', async () => {
    h.operational.farms.listByProducer.mockResolvedValue({ data: [] });
    renderOffers();
    await openOffersTab();

    expect(await screen.findByText(/No tienes fincas registradas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ir a Fincas' }));
    expect(screen.getByRole('heading', { name: /Gestionar Fincas/ })).toBeInTheDocument();
  });

  it('2. entrada directa a Ofertas: auto-selecciona la única finca y carga sus seis cultivos', async () => {
    renderOffers();
    await openOffersTab();

    const select = await screen.findByRole('combobox', { name: 'Cultivo' });
    expect(within(select).getAllByRole('option')).toHaveLength(7); // placeholder + 6 reales
    expect(h.operational.crops.list).toHaveBeenCalledWith(VILLA_ID);
    expect(screen.queryByText('Selecciona un cultivo para crear una oferta')).not.toBeInTheDocument();
  });

  it('3. productor con varias fincas: muestra selector y el cambio recarga cultivos', async () => {
    h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA, OTRA] });
    renderOffers();
    await openOffersTab();

    const farmSelect = await screen.findByRole('combobox', { name: 'Finca' });
    expect(screen.getByText('Selecciona una finca')).toBeInTheDocument();
    expect(h.operational.crops.list).not.toHaveBeenCalled();

    await userEvent.selectOptions(farmSelect, OTRA_ID);
    const cropSelect = await screen.findByRole('combobox', { name: 'Cultivo' });
    expect(within(cropSelect).getAllByRole('option')).toHaveLength(2); // placeholder + Yuca
    expect(h.operational.crops.list).toHaveBeenLastCalledWith(OTRA_ID);
  });

  it('4 y 8. seis cultivos reales en el selector; elegir uno muestra el formulario', async () => {
    renderOffers();
    await openOffersTab();

    const select = await screen.findByRole('combobox', { name: 'Cultivo' });
    for (const name of SIX_NAMES) {
      expect(within(select).getByRole('option', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Publicar oferta' })).not.toBeInTheDocument();

    await userEvent.selectOptions(select, `${VILLA_ID}-c3`);
    expect(screen.getByRole('button', { name: 'Publicar oferta' })).toBeInTheDocument();
  });

  it('cambiar de finca limpia el cultivo elegido de la finca anterior', async () => {
    h.operational.farms.listByProducer.mockResolvedValue({ data: [VILLA, OTRA] });
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Finca' }), VILLA_ID);
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c1`);
    expect(screen.getByRole('button', { name: 'Publicar oferta' })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Finca' }), OTRA_ID);

    expect(screen.queryByRole('button', { name: 'Publicar oferta' })).not.toBeInTheDocument();
  });
});

describe('Ofertas: creación y listado', () => {
  async function fillAndPublish(extra: Partial<Record<'quantity' | 'start' | 'end', string>> = {}) {
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c3`);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cantidad disponible' }), extra.quantity ?? '12');
    if (extra.start) await userEvent.type(screen.getByLabelText('Disponible desde'), extra.start);
    if (extra.end) await userEvent.type(screen.getByLabelText('Disponible hasta'), extra.end);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar oferta' }));
  }

  it('10 y 5. publica con el cultivo real, omite fechas vacías, confirma y recarga Mis ofertas', async () => {
    await fillAndPublish();

    await waitFor(() => expect(h.operational.offers.create).toHaveBeenCalledTimes(1));
    const [cropId, body] = h.operational.offers.create.mock.calls[0];
    expect(cropId).toBe(`${VILLA_ID}-c3`);
    expect(body).toMatchObject({ available_quantity: 12, unit: 'kg' });
    expect(body.availability_start).toBeUndefined();
    expect(body.availability_end).toBeUndefined();
    expect(await screen.findByRole('status')).toHaveTextContent('Oferta de Plátano publicada correctamente.');
    await waitFor(() => expect(h.identity.myOffers).toHaveBeenCalledTimes(2));
  });

  it('11. error del backend se muestra con su detalle, sin borrar el formulario', async () => {
    h.operational.offers.create.mockRejectedValue(
      Object.assign(new Error('400'), { response: { data: { detail: 'Cultivo no encontrado' } } }),
    );
    await fillAndPublish();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cultivo no encontrado');
    expect(screen.getByRole('spinbutton', { name: 'Cantidad disponible' })).toHaveValue(12);
  });

  it('validación: fin anterior a inicio no envía nada', async () => {
    await fillAndPublish({ start: '2026-11-10', end: '2026-11-01' });

    expect(await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.')).toBeInTheDocument();
    expect(h.operational.offers.create).not.toHaveBeenCalled();
  });

  it('validación: cantidad cero no envía nada', async () => {
    await fillAndPublish({ quantity: '0' });

    expect(await screen.findByText('La cantidad disponible debe ser mayor que cero.')).toBeInTheDocument();
    expect(h.operational.offers.create).not.toHaveBeenCalled();
  });

  it('9 y listado. Mis ofertas muestra cultivo, finca, estado en español y periodo', async () => {
    h.identity.myOffers.mockResolvedValue({
      data: [
        {
          id: 'o1',
          farm_crop_id: `${VILLA_ID}-c3`,
          available_quantity: 5,
          unit: 'kg',
          availability_start: '2026-10-01',
          availability_end: '2026-12-01',
          status: 'available',
          created_at: '2026-10-20T10:00:00Z',
          updated_at: '2026-10-20T10:00:00Z',
          crop_name: 'Plátano',
          farm_name: 'villa carolina',
        },
      ],
    });
    renderOffers();
    await openOffersTab();

    const list = (await screen.findByRole('heading', { name: 'Mis ofertas' })).parentElement as HTMLElement;
    expect(await within(list).findByText('Plátano')).toBeInTheDocument();
    expect(within(list).getByText('villa carolina')).toBeInTheDocument();
    expect(within(list).getByText('Disponible')).toBeInTheDocument();
    expect(within(list).getByText(/1 oct.*1 dic/)).toBeInTheDocument();
  });

  it('listado propio con error: muestra error y reintento, no "Todavía no has publicado"', async () => {
    h.identity.myOffers.mockRejectedValue(new Error('500'));
    renderOffers();
    await openOffersTab();

    expect(await screen.findByText('No pudimos cargar tus ofertas.')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no has publicado ofertas.')).not.toBeInTheDocument();
  });
});

describe('Ofertas: roles', () => {
  it('13. comprador sin rol productor no obtiene la UI de creación', async () => {
    renderOffers(['buyer']);
    await userEvent.click(screen.getByRole('button', { name: 'Ofertas' }));

    expect(screen.queryByRole('heading', { name: 'Crear nueva oferta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar oferta' })).not.toBeInTheDocument();
  });

  it('14. cuenta con productor y comprador sí obtiene la UI de productor', async () => {
    renderOffers(['producer', 'buyer']);
    await openOffersTab();

    expect(await screen.findByRole('heading', { name: 'Crear nueva oferta' })).toBeInTheDocument();
  });
});

const PUBLISHED = {
  id: 'o1',
  farm_crop_id: `${VILLA_ID}-c3`,
  available_quantity: 800,
  unit: 'kg',
  price_per_unit: 8000,
  availability_start: '2026-10-24',
  availability_end: '2026-10-28',
  description: 'Café con alta calidad',
  status: 'available',
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  crop_name: 'Plátano',
  farm_name: 'villa carolina',
};

describe('Panel de ofertas: jerarquía, colapsable y estados', () => {
  it('productor sin ofertas: empty state y formulario abierto por defecto', async () => {
    renderOffers();
    await openOffersTab();

    expect(await screen.findByRole('heading', { name: 'Aún no tienes ofertas publicadas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crear nueva oferta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar formulario' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('productor con oferta: Mis ofertas aparece antes del formulario y el formulario queda cerrado', async () => {
    h.identity.myOffers.mockResolvedValue({ data: [PUBLISHED] });
    renderOffers();
    await openOffersTab();

    const mine = await screen.findByRole('heading', { name: 'Mis ofertas' });
    const toggle = screen.getByRole('button', { name: '+ Crear nueva oferta' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Crear nueva oferta' })).not.toBeInTheDocument();
    expect(mine.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('el botón abre el formulario y "Ocultar formulario" lo cierra', async () => {
    h.identity.myOffers.mockResolvedValue({ data: [PUBLISHED] });
    renderOffers();
    await openOffersTab();
    await userEvent.click(await screen.findByRole('button', { name: '+ Crear nueva oferta' }));

    expect(screen.getByRole('heading', { name: 'Crear nueva oferta' })).toBeInTheDocument();
    const hide = screen.getByRole('button', { name: 'Ocultar formulario' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(hide);
    expect(screen.queryByRole('heading', { name: 'Crear nueva oferta' })).not.toBeInTheDocument();
  });

  it('publicar: llama create, refresca, limpia, cierra y muestra la oferta nueva con mensaje de éxito', async () => {
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c3`);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cantidad disponible' }), '800');
    h.identity.myOffers.mockResolvedValue({ data: [PUBLISHED] });

    await userEvent.click(screen.getByRole('button', { name: 'Publicar oferta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Oferta de Plátano publicada correctamente.');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Crear nueva oferta' })).not.toBeInTheDocument());
    const list = screen.getByRole('heading', { name: 'Mis ofertas' }).parentElement as HTMLElement;
    expect(await within(list).findByText('Plátano')).toBeInTheDocument();
    expect(h.operational.offers.create).toHaveBeenCalledTimes(1);
  });

  it('card: cultivo, finca, cantidad, precio, fechas, descripción y estado', async () => {
    h.identity.myOffers.mockResolvedValue({ data: [PUBLISHED] });
    renderOffers();
    await openOffersTab();

    const card = (await screen.findByRole('heading', { name: 'Plátano' })).closest('article') as HTMLElement;
    expect(within(card).getByText('Disponible')).toBeInTheDocument();
    expect(within(card).getByText('villa carolina')).toBeInTheDocument();
    expect(within(card).getByText('800 kg')).toBeInTheDocument();
    expect(within(card).getByText(/8\.000/)).toBeInTheDocument();
    expect(within(card).getByText(/24 oct.*28 oct/)).toBeInTheDocument();
    expect(within(card).getByText('Café con alta calidad')).toBeInTheDocument();
  });

  it('acciones: marcar agotada envía PATCH status sold_out y refresca', async () => {
    h.identity.myOffers.mockResolvedValue({ data: [PUBLISHED] });
    h.operational.offers.update.mockResolvedValue({ data: { ...PUBLISHED, status: 'sold_out' } });
    renderOffers();
    await openOffersTab();
    const card = (await screen.findByRole('heading', { name: 'Plátano' })).closest('article') as HTMLElement;

    await userEvent.click(within(card).getByRole('button', { name: 'Marcar agotada' }));

    expect(h.operational.offers.update).toHaveBeenCalledWith('o1', { status: 'sold_out' });
    await waitFor(() => expect(h.identity.myOffers).toHaveBeenCalledTimes(2));
  });

  it('estado agotada muestra badge en texto y ofrece reactivar, sin acciones de venta', async () => {
    h.identity.myOffers.mockResolvedValue({ data: [{ ...PUBLISHED, status: 'sold_out' }] });
    renderOffers();
    await openOffersTab();
    const card = (await screen.findByRole('heading', { name: 'Plátano' })).closest('article') as HTMLElement;

    expect(within(card).getByText('Agotada')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Marcar agotada' })).not.toBeInTheDocument();
  });

  it('validación junto al campo: fin anterior marca el input y vincula el mensaje', async () => {
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c3`);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cantidad disponible' }), '5');
    await userEvent.type(screen.getByLabelText('Disponible desde'), '2026-11-10');
    await userEvent.type(screen.getByLabelText('Disponible hasta'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar oferta' }));

    const end = screen.getByLabelText('Disponible hasta');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveAttribute('aria-describedby', 'offer-end-error');
    expect(document.getElementById('offer-end-error')).toHaveTextContent('La fecha de fin no puede ser anterior');
    expect(h.operational.offers.create).not.toHaveBeenCalled();
  });

  it('vista previa se actualiza mientras se escribe', async () => {
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c3`);
    const preview = screen.getByRole('complementary', { name: 'Vista previa de la oferta' });
    expect(within(preview).getByText('Plátano')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cantidad disponible' }), '7');

    expect(within(preview).getByText(/7 kg/)).toBeInTheDocument();
  });

  it('cada campo tiene label vinculado por id', async () => {
    renderOffers();
    await openOffersTab();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Cultivo' }), `${VILLA_ID}-c3`);

    expect(screen.getByLabelText('Cantidad disponible')).toHaveAttribute('id', 'offer-quantity');
    expect(screen.getByLabelText('Unidad')).toHaveAttribute('name', 'unit');
    expect(screen.getByLabelText('Descripción (opcional)').tagName).toBe('TEXTAREA');
  });
});

describe('Regresión cultivos', () => {
  it('10 (cultivos). entrar a Cultivos sigue mostrando los seis, sin el mensaje de vacío', async () => {
    renderOffers();
    await userEvent.click(screen.getByRole('button', { name: 'Cultivos' }));

    const list = (await screen.findByText('Cultivos de la Finca')).parentElement as HTMLElement;
    await waitFor(() => expect(list.querySelectorAll('.item')).toHaveLength(6));
    expect(screen.queryByText('Esta finca todavía no tiene cultivos registrados.')).not.toBeInTheDocument();
  });
});
