import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { CurrentOffer } from '@/services/api';
import { OfferDetailPage, ACTIVATE_BUYER_MESSAGE, ANONYMOUS_CONTACT_MESSAGE, NO_MESSAGING_MESSAGE } from '../OfferDetailPage';

const h = vi.hoisted(() => ({
  api: {
    operational: {
      currentOffers: { get: vi.fn() },
    },
  },
  conversations: {
    create: vi.fn(),
  },
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: h.api };
});

vi.mock('@/services/conversations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/conversations')>();
  return { ...actual, conversationsApi: h.conversations };
});

const BASE_OFFER: CurrentOffer = {
  id: 'offer-1',
  farm_crop_id: 'crop-1',
  farm_id: 'farm-1',
  farm_name: 'Finca La Esperanza',
  producer_id: 'producer-1',
  producer_name: 'Ana Pérez',
  producer_verified: false,
  producer_contact: { public_phone: '3001112233', public_email: 'ventas@finca.example', whatsapp: null },
  messaging_available: true,
  municipality_name: 'Dagua',
  municipality_code: '76109',
  crop_name: 'Café',
  quantity: 120,
  unit: 'kg',
  available_from: null,
  available_until: null,
  price_per_unit: 9000,
  status: 'available',
  source: 'Raíces Conectadas',
  data_type: 'operational',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
} as CurrentOffer;

function renderOffer(offer: CurrentOffer, overrides: Partial<AuthContextValue>) {
  h.api.operational.currentOffers.get.mockResolvedValue({ data: offer });
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    setRoleActive: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  render(
    <AuthContext.Provider value={value}>
      <OfferDetailPage offerId={offer.id} />
    </AuthContext.Provider>,
  );
  return value;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/mercado/oferta/offer-1');
});

describe('OfferDetailPage', () => {
  it('a un anónimo le pide iniciar sesión como comprador con crear cuenta e iniciar sesión', async () => {
    renderOffer(BASE_OFFER, { status: 'anonymous' });

    expect(await screen.findByText(ANONYMOUS_CONTACT_MESSAGE)).toBeInTheDocument();
    const cta = screen.getByRole('region', { name: 'Contactar al productor' });
    expect(within(cta).getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(within(cta).getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(within(cta).queryByRole('button', { name: 'Contactar productor' })).not.toBeInTheDocument();
  });

  it('a un autenticado sin rol comprador le ofrece activarlo', async () => {
    const value = renderOffer(BASE_OFFER, {
      status: 'authenticated',
      roles: ['producer'],
      user: { id: 'user-1', email: 'ana@example.com' },
    });

    expect(await screen.findByText(ACTIVATE_BUYER_MESSAGE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar rol comprador' }));
    expect(value.setRoleActive).toHaveBeenCalledWith('buyer', true);
  });

  it('un comprador inicia la conversación y pasa a /mensajes con el id devuelto', async () => {
    h.conversations.create.mockResolvedValue({ data: { id: 'conv-99' } });
    renderOffer(BASE_OFFER, {
      status: 'authenticated',
      roles: ['buyer'],
      user: { id: 'user-1', email: 'compra@example.com' },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Contactar productor' }));

    await waitFor(() => expect(window.location.pathname).toBe('/mensajes'));
    expect(window.location.search).toBe('?c=conv-99');
    expect(h.conversations.create).toHaveBeenCalledWith('offer-1');
  });

  it('muestra el error del backend si no se puede iniciar la conversación', async () => {
    h.conversations.create.mockRejectedValue({
      response: { status: 409, data: { detail: 'Este productor aún no tiene una cuenta vinculada para mensajería interna.' } },
    });
    renderOffer(BASE_OFFER, { status: 'authenticated', roles: ['buyer'], user: { id: 'u', email: 'x@example.com' } });

    await userEvent.click(await screen.findByRole('button', { name: 'Contactar productor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este productor aún no tiene una cuenta vinculada');
  });

  it('si el productor no tiene mensajería, muestra el aviso y el contacto público alternativo', async () => {
    renderOffer(
      { ...BASE_OFFER, messaging_available: false },
      { status: 'authenticated', roles: ['buyer'], user: { id: 'u', email: 'x@example.com' } },
    );

    expect(await screen.findByText(NO_MESSAGING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contactar productor' })).not.toBeInTheDocument();
    expect(screen.getByText('Teléfono: 3001112233')).toBeInTheDocument();
  });

  it('no renderiza email ni teléfono cuando el productor no hizo visible su contacto', async () => {
    renderOffer(
      { ...BASE_OFFER, producer_contact: null, messaging_available: false },
      { status: 'anonymous' },
    );

    await screen.findByText(NO_MESSAGING_MESSAGE);
    expect(screen.queryByText(/ventas@finca\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText(/3001112233/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Contacto público del productor' })).not.toBeInTheDocument();
  });
});

describe('Contactar productor: retorno a la oferta original', () => {
  it('anónimo entra desde otra ruta, crea cuenta comprador y vuelve a la oferta', async () => {
    window.history.pushState({}, '', '/');
    const signUp = vi.fn(async () => ({ ok: true as const }));
    renderOffer(BASE_OFFER, { status: 'anonymous', signUp });

    await userEvent.click(await screen.findByRole('button', { name: 'Crear cuenta' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Luis');
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'luis@example.com');
    await userEvent.type(within(dialog).getByLabelText('Contraseña'), 'clave-segura-123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ choice: 'buyer' })));
    await waitFor(() => expect(window.location.pathname).toBe('/mercado/oferta/offer-1'));
    expect(window.sessionStorage.getItem('raices-return-path')).toBeNull();
  });
});

describe('Detalle de oferta: cantidad, precio y unidad explícitos', () => {
  it('sección Oferta: cantidad, precio con moneda, unidad de venta, disponibilidad y descripción', async () => {
    renderOffer(
      {
        ...BASE_OFFER,
        quantity: 800,
        unit: 'kg',
        price_per_unit: 8000,
        available_from: '2026-10-24',
        available_until: '2026-10-28',
        description: 'cafe con alta calidad, ganador al premio de la taza',
      },
      {},
    );

    const section = (await screen.findByRole('heading', { name: 'Oferta' })).closest('section') as HTMLElement;
    expect(within(section).getByText('Cantidad disponible').nextElementSibling).toHaveTextContent('800 kg');
    expect(within(section).getByText('Precio por unidad').nextElementSibling).toHaveTextContent('COP $8.000/kg');
    expect(within(section).getByText('Unidad de venta').nextElementSibling).toHaveTextContent('Kilogramo (kg)');
    expect(within(section).getByText('Disponibilidad').nextElementSibling).toHaveTextContent(/24\/10\/2026/);
    expect(within(section).getByText('cafe con alta calidad, ganador al premio de la taza')).toBeInTheDocument();
  });

  it('la cabecera conserva "800 kg · COP $8.000/kg"', async () => {
    renderOffer({ ...BASE_OFFER, quantity: 800, unit: 'kg', price_per_unit: 8000 }, {});

    const header = (await screen.findByRole('heading', { name: 'Café' })).closest('article') as HTMLElement;
    expect(header.querySelector('.market-quantity')).toHaveTextContent('800 kg · COP $8.000/kg');
  });

  it('unidad desconocida "caja" se muestra tal cual, sin inventar etiqueta', async () => {
    renderOffer({ ...BASE_OFFER, quantity: 3, unit: 'caja', price_per_unit: 500 }, {});

    const section = (await screen.findByRole('heading', { name: 'Oferta' })).closest('section') as HTMLElement;
    expect(within(section).getByText('Cantidad disponible').nextElementSibling).toHaveTextContent('3 caja');
    expect(within(section).getByText('Unidad de venta').nextElementSibling).toHaveTextContent('caja');
    expect(within(section).getByText('Precio por unidad').nextElementSibling).toHaveTextContent('COP $500/caja');
  });

  it('sin precio publicado: "No indicado", sin inventar un monto', async () => {
    renderOffer({ ...BASE_OFFER, price_per_unit: null }, {});

    const section = (await screen.findByRole('heading', { name: 'Oferta' })).closest('section') as HTMLElement;
    expect(within(section).getByText('Precio por unidad').nextElementSibling).toHaveTextContent('No indicado');
  });
});

describe('Detalle de oferta: perfil público del productor', () => {
  it('"Ver perfil del productor" lleva a /productores/{producer_id}', async () => {
    renderOffer({ ...BASE_OFFER }, {});

    await userEvent.click(await screen.findByRole('button', { name: 'Ver perfil del productor' }));

    expect(window.location.pathname).toBe('/productores/producer-1');
  });
});
