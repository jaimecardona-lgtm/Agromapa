import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { RankingSnapshot } from '../RankingSnapshot';

const h = vi.hoisted(() => ({ me: vi.fn() }));

vi.mock('@/services/rankings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/rankings')>();
  return { ...actual, rankingsApi: { get: vi.fn(), me: h.me } };
});

const MINE = {
  has_scores: true,
  best: { cosechas: 770, 'eco-puzzle': 900, 'cazadores-residuos': 820 },
  general: 2490,
  territory: { department_code: '76', department_name: 'Valle del Cauca', municipality_code: '76890', municipality_name: 'Yotoco' },
  positions: { national: { rank: 102, of: 400 }, department: { rank: 18, of: 90 }, municipality: { rank: 2, of: 12 } },
  missing_territory: [],
};

function renderSnapshot(status: AuthContextValue['status']) {
  const value: AuthContextValue = { ...defaultAuthValue, configured: true, status };
  return render(
    <AuthContext.Provider value={value}>
      <RankingSnapshot gameSlug="cosechas" score={740} />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.me.mockResolvedValue({ data: MINE });
});

describe('resultado de partida con cuenta', () => {
  it('muestra puntaje obtenido, mejor personal y posición municipal', async () => {
    renderSnapshot('authenticated');

    expect(await screen.findByText('Ranking municipal (general):')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Tu resultado en el ranking' });
    expect(section).toHaveTextContent('Puntaje obtenido: 740');
    expect(section).toHaveTextContent('Mejor personal en Cosechas: 770');
    expect(section).toHaveTextContent('#2 de 12');
  });

  it('hace una sola consulta al terminar la partida', async () => {
    renderSnapshot('authenticated');
    await screen.findByText('Ranking municipal (general):');

    expect(h.me).toHaveBeenCalledTimes(1);
  });

  it('sin municipio: pide completarlo, sin inventar posición', async () => {
    h.me.mockResolvedValue({
      data: { ...MINE, positions: { ...MINE.positions, municipality: null }, missing_territory: ['municipality'] },
    });
    renderSnapshot('authenticated');

    expect(
      await screen.findByText('Completa tu municipio en Mi cuenta para participar en el ranking municipal.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/#\d+ de \d+/)).not.toBeInTheDocument();
  });

  it('fallo de la consulta: mensaje visible, el puntaje sigue apareciendo', async () => {
    h.me.mockRejectedValue(new Error('network'));
    renderSnapshot('authenticated');

    expect(await screen.findByText('No pudimos cargar tu posición ahora.')).toBeInTheDocument();
    expect(screen.getByText('740')).toBeInTheDocument();
  });
});

describe('resultado de partida como invitado', () => {
  it('no consulta el ranking ni muestra posiciones', () => {
    const { container } = renderSnapshot('anonymous');

    expect(h.me).not.toHaveBeenCalled();
    expect(container.querySelector('.ranking-snapshot')).toBeNull();
  });
});
