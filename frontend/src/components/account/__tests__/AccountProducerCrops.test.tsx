import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import type { Farm, FarmCropDetail } from '@/services/api';
import { AccountPage } from '../AccountPage';

const h = vi.hoisted(() => ({
  identity: {
    myGameScores: vi.fn(),
    myFarms: vi.fn(),
    myOffers: vi.fn(),
    updateMe: vi.fn(),
  },
  conversations: { list: vi.fn() },
  api: {
    operational: {
      crops: { list: vi.fn() },
    },
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

vi.mock('@/services/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/identity')>();
  return { ...actual, identityApi: h.identity };
});


const rankingMe = vi.hoisted(() => ({
  me: vi.fn(async () => ({
    data: {
      has_scores: false,
      best: {},
      general: null,
      territory: { department_code: null, department_name: null, municipality_code: null, municipality_name: null },
      positions: { national: null, department: null, municipality: null },
      missing_territory: ['department', 'municipality'],
    },
  })),
}));

vi.mock('@/services/rankings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/rankings')>();
  return { ...actual, rankingsApi: { get: vi.fn(), me: rankingMe.me } };
});

const VILLA = {
  id: 'b058a6e5-687f-4449-b2bd-e1f3c1893159',
  name: 'villa carolina',
  municipality_code: '76890',
  active: true,
} as Farm;

function crop(id: string, name: string): FarmCropDetail {
  return {
    id,
    farm_id: VILLA.id,
    crop_name: name,
    area_hectares: 1,
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

function renderProducerAccount() {
  const value: AuthContextValue = {
    ...defaultAuthValue,
    configured: true,
    status: 'authenticated',
    user: { id: 'user-1', email: 'productor@example.com' },
    me: {
      id: 'user-1',
      email: 'productor@example.com',
      profile: {
        id: 'user-1',
        display_name: 'Jaime Cardona',
        country_code: 'CO',
        department_code: '76',
        municipality_code: '76890',
        avatar_url: null,
        created_at: '2026-10-12T10:00:00Z',
        updated_at: '2026-10-12T10:00:00Z',
      },
      roles: ['producer'],
      producer_profile: null,
      buyer_profile: null,
    },
    roles: ['producer'],
    setRoleActive: vi.fn(async () => ({ ok: true as const })),
    refreshMe: vi.fn(async () => undefined),
  };
  return render(
    <AuthContext.Provider value={value}>
      <AccountPage />
    </AuthContext.Provider>,
  );
}

function sectionFor(headingName: string): HTMLElement {
  return screen.getByRole('heading', { name: headingName }).parentElement as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.identity.myGameScores.mockResolvedValue({ data: [] });
  h.identity.myFarms.mockResolvedValue({ data: [VILLA] });
  h.identity.myOffers.mockResolvedValue({ data: [] });
  h.conversations.list.mockResolvedValue({ data: [] });
  h.api.operational.crops.list.mockResolvedValue({ data: SIX_CROPS });
});

describe('/cuenta: actividad productiva con datos reales', () => {
  it('G. muestra la finca real y los 6 cultivos reales del endpoint', async () => {
    renderProducerAccount();

    expect(await screen.findByText('villa carolina')).toBeInTheDocument();
    expect(h.api.operational.crops.list).toHaveBeenCalledWith(VILLA.id);
    const cropsSection = sectionFor('Mis cultivos');
    for (const name of ['Café', 'cafe', 'Plátano', 'Mandarina', 'Naranja', 'caña']) {
      expect(await within(cropsSection).findByText(name)).toBeInTheDocument();
    }
    expect(within(cropsSection).queryByText('Aún no tienes cultivos registrados.')).not.toBeInTheDocument();
  });

  it('H. si la API de cultivos falla muestra error y NO "Aún no tienes cultivos"', async () => {
    h.api.operational.crops.list.mockRejectedValue(new Error('500'));
    renderProducerAccount();

    const cropsSection = await screen.findByRole('heading', { name: 'Mis cultivos' }).then((h3) => h3.parentElement as HTMLElement);
    expect(await within(cropsSection).findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los cultivos de villa carolina.',
    );
    expect(within(cropsSection).queryByText('Aún no tienes cultivos registrados.')).not.toBeInTheDocument();
  });

  it('H. un fallo de la finca no oculta los cultivos de las demás', async () => {
    const OTRA = { ...VILLA, id: 'farm-2', name: 'finca del norte' } as Farm;
    h.identity.myFarms.mockResolvedValue({ data: [VILLA, OTRA] });
    h.api.operational.crops.list.mockImplementation((farmId: string) =>
      farmId === VILLA.id ? Promise.resolve({ data: SIX_CROPS }) : Promise.reject(new Error('500')),
    );
    renderProducerAccount();

    const cropsSection = await screen.findByRole('heading', { name: 'Mis cultivos' }).then((h3) => h3.parentElement as HTMLElement);
    expect(await within(cropsSection).findByText('Café')).toBeInTheDocument();
    expect(within(cropsSection).getByRole('alert')).toHaveTextContent('No pudimos cargar los cultivos de finca del norte.');
  });

  it('Mi progreso muestra mejores puntajes y posiciones reales del ranking', async () => {
    rankingMe.me.mockResolvedValueOnce({
      data: {
        has_scores: true,
        best: { cosechas: 770, 'eco-puzzle': 900, 'cazadores-residuos': 820 },
        general: 2490,
        territory: { department_code: '76', department_name: 'Valle del Cauca', municipality_code: '76890', municipality_name: 'Yotoco' },
        positions: { national: { rank: 102, of: 400 }, department: { rank: 18, of: 90 }, municipality: { rank: 3, of: 12 } },
        missing_territory: [],
      },
    });
    renderProducerAccount();

    const progress = await screen.findByRole('region', { name: 'Mi progreso' });
    expect(within(progress).getByRole('list', { name: 'Mejores puntajes' })).toHaveTextContent('Cosechas: 770');
    expect(within(progress).getByRole('list', { name: 'Mejores puntajes' })).toHaveTextContent('Puntaje general: 2490');
    const positions = within(progress).getByRole('list', { name: 'Mis posiciones' });
    expect(positions).toHaveTextContent('Municipio: #3 de 12');
    expect(positions).toHaveTextContent('Departamento: #18 de 90');
    expect(positions).toHaveTextContent('Colombia: #102 de 400');
    expect(within(progress).getByRole('button', { name: 'Ver ranking' })).toBeInTheDocument();
  });

  it('Mi progreso con error de red muestra el error, no ceros inventados', async () => {
    rankingMe.me.mockRejectedValueOnce(new Error('network'));
    renderProducerAccount();

    expect(await screen.findByText('No pudimos cargar tu progreso.')).toBeInTheDocument();
    expect(screen.queryByText('Puntaje general: 0')).not.toBeInTheDocument();
  });
});
