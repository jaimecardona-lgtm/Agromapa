import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { RankingPage } from '../RankingPage';

// Contratos reales: la API responde { data }. Solo posición, nombre público, puntaje y territorio.
const h = vi.hoisted(() => ({
  get: vi.fn(),
  me: vi.fn(),
  territories: { getDepartments: vi.fn(), getMunicipalities: vi.fn() },
}));

vi.mock('@/services/rankings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/rankings')>();
  return { ...actual, rankingsApi: { get: h.get, me: h.me } };
});

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, api: { ...actual.api, territories: h.territories } };
});

const NATIONAL = {
  scope: 'national',
  game: 'general',
  territory: { department_code: null, department_name: null, municipality_code: null, municipality_name: null },
  count: 4,
  entries: [
    { rank: 1, display_name: 'Ana', score: 2490, department_code: '76', municipality_code: '76890', is_me: false },
    { rank: 2, display_name: 'Beto', score: 1500, department_code: '76', municipality_code: '76890', is_me: false },
    { rank: 3, display_name: 'Carla', score: 900, department_code: '11', municipality_code: '11001', is_me: false },
    { rank: 4, display_name: 'Diego', score: 500, department_code: null, municipality_code: null, is_me: false },
  ],
};

const EMPTY = { ...NATIONAL, count: 0, entries: [] };

function renderRanking(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = { ...defaultAuthValue, configured: true, ...overrides };
  return render(
    <AuthContext.Provider value={value}>
      <RankingPage />
    </AuthContext.Provider>,
  );
}

const SIGNED_IN: Partial<AuthContextValue> = {
  status: 'authenticated',
  user: { id: 'user-1', email: 'jaime@example.com' },
  roles: ['producer'],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.get.mockResolvedValue({ data: NATIONAL });
  h.me.mockResolvedValue({
    data: {
      has_scores: true,
      best: { cosechas: 770, 'eco-puzzle': 900, 'cazadores-residuos': 820 },
      general: 2490,
      territory: { department_code: '76', department_name: 'Valle del Cauca', municipality_code: '76890', municipality_name: 'Yotoco' },
      positions: {
        national: { rank: 102, of: 400 },
        department: { rank: 18, of: 90 },
        municipality: { rank: 3, of: 12 },
      },
      missing_territory: [],
    },
  });
  h.territories.getDepartments.mockResolvedValue({ data: { data: [{ dane_code: '76', name: 'Valle del Cauca' }] } });
  h.territories.getMunicipalities.mockResolvedValue({ data: { data: [{ dane_code: '76890', name: 'Yotoco' }] } });
});

describe('ranking público', () => {
  it('muestra medallas en el top 3 y posiciones normales después', async () => {
    renderRanking();

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('🥇');
    expect(rows[1]).toHaveTextContent('🥈');
    expect(rows[2]).toHaveTextContent('🥉');
    expect(rows[3]).toHaveTextContent('#4');
    expect(rows[0]).toHaveTextContent('Ana');
    expect(rows[0]).toHaveTextContent('2490');
  });

  it('pide el ranking general de Colombia por defecto', async () => {
    renderRanking();
    await screen.findByText('Ana');

    expect(h.get).toHaveBeenCalledWith(expect.objectContaining({ scope: 'national', game: 'general' }));
  });

  it('las pestañas cambian el juego consultado', async () => {
    renderRanking();
    await screen.findByText('Ana');

    await userEvent.click(screen.getByRole('tab', { name: 'Cosechas' }));

    await waitFor(() => expect(h.get).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'cosechas' })));
    expect(screen.getByRole('tab', { name: 'Cosechas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cazadores de Residuos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Eco-Puzzle' })).toBeInTheDocument();
  });

  it('estado vacío sin inventar posiciones', async () => {
    h.get.mockResolvedValue({ data: EMPTY });
    renderRanking();

    expect(await screen.findByText('Todavía no hay jugadores clasificados aquí. ¡Sé el primero!')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('error de red: mensaje y Reintentar, no un ranking vacío', async () => {
    h.get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: NATIONAL });
    renderRanking();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el ranking.');
    expect(screen.queryByText('Todavía no hay jugadores clasificados aquí. ¡Sé el primero!')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
  });

  it('no tiene tablas: las filas se apilan y se leen en móvil', async () => {
    const { container } = renderRanking();
    await screen.findByText('Ana');

    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.ranking-row')).not.toBeNull();
  });

  it('nunca muestra email ni datos de contacto', async () => {
    const { container } = renderRanking();
    await screen.findByText('Ana');

    expect(container.textContent ?? '').not.toMatch(/@/);
  });
});

describe('alcance territorial', () => {
  it('departamento sin elegir: pide elegir y no consulta', async () => {
    renderRanking();
    await screen.findByText('Ana');
    h.get.mockClear();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Alcance' }), 'department');

    expect(screen.getByText('Elige un departamento para ver su ranking.')).toBeInTheDocument();
    expect(h.get).not.toHaveBeenCalled();
  });

  it('municipio: nombres reales del catálogo, no códigos', async () => {
    renderRanking();
    await screen.findByText('Ana');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Alcance' }), 'municipality');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Departamento' }), '76');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Municipio' }), '76890');

    await waitFor(() =>
      expect(h.get).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'municipality', municipality_code: '76890' })),
    );
    expect(screen.getByRole('option', { name: 'Yotoco' })).toBeInTheDocument();
    expect(screen.queryByText('76890')).not.toBeInTheDocument();
  });
});

describe('usuario autenticado y fila propia', () => {
  it('destaca su fila y muestra su posición municipal, departamental y nacional', async () => {
    h.get.mockResolvedValue({
      data: { ...NATIONAL, entries: [{ ...NATIONAL.entries[1], is_me: true, display_name: 'Jaime' }] },
    });
    renderRanking(SIGNED_IN);

    const mine = await screen.findByRole('region', { name: /Tu posición/i }).catch(() => null);
    const summary = mine ?? screen.getByRole('heading', { name: 'Tu posición' }).closest('section') as HTMLElement;
    expect(within(summary).getByText('#3 de 12')).toBeInTheDocument();
    expect(within(summary).getByText('#18 de 90')).toBeInTheDocument();
    expect(within(summary).getByText('#102 de 400')).toBeInTheDocument();
    expect(await screen.findByText('(tú)')).toBeInTheDocument();
    expect(screen.getByText('(tú)').closest('li')).toHaveClass('ranking-row--me');
  });

  it('sin puntajes: invita a jugar, sin posiciones inventadas', async () => {
    h.me.mockResolvedValue({
      data: {
        has_scores: false,
        best: {},
        general: null,
        territory: { department_code: '76', department_name: 'Valle del Cauca', municipality_code: '76890', municipality_name: 'Yotoco' },
        positions: { national: null, department: null, municipality: null },
        missing_territory: [],
      },
    });
    renderRanking(SIGNED_IN);

    expect(await screen.findByText('Juega una partida para aparecer en el ranking.')).toBeInTheDocument();
  });

  it('sin municipio en el perfil: pide completarlo en Mi cuenta', async () => {
    h.me.mockResolvedValue({
      data: {
        has_scores: true,
        best: { cosechas: 300 },
        general: 300,
        territory: { department_code: '76', department_name: 'Valle del Cauca', municipality_code: null, municipality_name: null },
        positions: { national: { rank: 9, of: 10 }, department: { rank: 2, of: 4 }, municipality: null },
        missing_territory: ['municipality'],
      },
    });
    renderRanking(SIGNED_IN);

    expect(
      await screen.findByText(/Completa tu municipio en Mi cuenta para participar en el ranking municipal\./),
    ).toBeInTheDocument();
  });
});

describe('invitado', () => {
  it('ve el CTA para guardar su puntaje, sin bloquear el ranking', async () => {
    renderRanking({ status: 'anonymous' });

    expect(await screen.findByText('Guarda tu puntaje y compite en el ranking.')).toBeInTheDocument();
    expect(h.me).not.toHaveBeenCalled();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });
});
