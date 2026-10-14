import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicGamesApp } from '../PublicGamesApp';
import { parsePublicRoute, gamePath } from '../publicRoutes';
import { apiClient } from '@/services/api';
import { PLAYER_ALIAS_KEY, PLAYER_ID_KEY, PLAYER_ONBOARDED_KEY, OWN_SCORE_IDS_KEY } from '@/services/gameScores';
import { ScoreReport } from '../../games/ScoreReport';
import { Leaderboard } from '../../games/Leaderboard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function setPath(path: string) {
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  window.localStorage.clear();
  setPath('/juegos');
});

afterEach(() => {
  vi.restoreAllMocks();
  setPath('/');
  Reflect.deleteProperty(navigator, 'share');
});

describe('rutas públicas', () => {
  it('reconoce el portal y los tres juegos', () => {
    expect(parsePublicRoute('/juegos')).toEqual({ kind: 'portal' });
    expect(parsePublicRoute('/juegos/')).toEqual({ kind: 'portal' });
    expect(parsePublicRoute('/juegos/cosechas')).toEqual({ kind: 'game', slug: 'cosechas' });
    expect(parsePublicRoute('/juegos/eco-puzzle')).toEqual({ kind: 'game', slug: 'eco-puzzle' });
    expect(parsePublicRoute('/juegos/cazadores-residuos')).toEqual({ kind: 'game', slug: 'cazadores-residuos' });
    expect(parsePublicRoute('/juegos/otro')).toEqual({ kind: 'unknown' });
    expect(gamePath('cosechas')).toBe('/juegos/cosechas');
  });
});

describe('portal /juegos', () => {
  it('muestra la marca y las tres tarjetas de juego', () => {
    render(<PublicGamesApp />);
    expect(screen.getByText('RAÍCES CONECTADAS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cosechas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Eco-Puzzle de Conexiones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cazadores de Residuos' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Jugar' })).toHaveLength(3);
  });

  it('no muestra navegación administrativa ni el mapa', () => {
    render(<PublicGamesApp />);
    expect(screen.queryByText(/Gestión Productiva/i)).not.toBeInTheDocument();
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });

  it('muestra el mejor puntaje local si existe', () => {
    window.localStorage.setItem('raices-game-cosechas-best', '320');
    render(<PublicGamesApp />);
    expect(screen.getByText('320')).toBeInTheDocument();
  });
});

describe('identidad anónima', () => {
  it('crea un UUID en la primera visita y lo guarda en localStorage', () => {
    render(<PublicGamesApp />);
    const id = window.localStorage.getItem(PLAYER_ID_KEY);
    expect(id).toMatch(UUID_RE);
  });

  it('pide el alias la primera vez', () => {
    render(<PublicGamesApp />);
    expect(screen.getByText('¿Cómo quieres aparecer?')).toBeInTheDocument();
  });

  it('guarda el alias escrito y oculta el aviso', async () => {
    const user = userEvent.setup();
    render(<PublicGamesApp />);
    await user.type(screen.getByLabelText('Nombre o alias'), '  Jaime   Cardona ');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(window.localStorage.getItem(PLAYER_ALIAS_KEY)).toBe('Jaime Cardona');
    expect(window.localStorage.getItem(PLAYER_ONBOARDED_KEY)).toBe('1');
    expect(screen.queryByText('¿Cómo quieres aparecer?')).not.toBeInTheDocument();
    expect(screen.getByText('Jaime Cardona')).toBeInTheDocument();
  });

  it('permite jugar sin alias: usa "Jugador" y no guarda alias', async () => {
    const user = userEvent.setup();
    render(<PublicGamesApp />);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(window.localStorage.getItem(PLAYER_ALIAS_KEY)).toBeNull();
    expect(screen.getByText('Jugador')).toBeInTheDocument();
  });

  it('conserva el mismo UUID y no vuelve a pedir alias al recargar', async () => {
    const user = userEvent.setup();
    const first = render(<PublicGamesApp />);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    const id = window.localStorage.getItem(PLAYER_ID_KEY);
    first.unmount();

    render(<PublicGamesApp />);
    expect(screen.queryByText('¿Cómo quieres aparecer?')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(PLAYER_ID_KEY)).toBe(id);
  });

  it('permite cambiar el alias después', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PLAYER_ONBOARDED_KEY, '1');
    render(<PublicGamesApp />);
    await user.click(screen.getByRole('button', { name: 'Cambiar alias' }));
    const input = screen.getByLabelText('Nuevo alias');
    await user.clear(input);
    await user.type(input, 'María');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(window.localStorage.getItem(PLAYER_ALIAS_KEY)).toBe('María');
  });

  it('regenera el UUID si el valor guardado es inválido', () => {
    window.localStorage.setItem(PLAYER_ID_KEY, 'no-es-uuid');
    render(<PublicGamesApp />);
    expect(window.localStorage.getItem(PLAYER_ID_KEY)).toMatch(UUID_RE);
  });
});

describe('rutas directas', () => {
  it('abre /juegos/cosechas directamente en el juego', () => {
    setPath('/juegos/cosechas');
    render(<PublicGamesApp />);
    expect(screen.getByText('Recolecta cultivos y evita obstáculos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Portal de juegos' })).toBeInTheDocument();
  });

  it('abre el eco-puzzle con selector de dificultad', () => {
    setPath('/juegos/eco-puzzle');
    render(<PublicGamesApp />);
    expect(screen.getByText('Selecciona tu nivel de dificultad')).toBeInTheDocument();
  });

  it('una ruta /juegos/... desconocida vuelve al portal', async () => {
    setPath('/juegos/no-existe');
    render(<PublicGamesApp />);
    await waitFor(() => expect(window.location.pathname).toBe('/juegos'));
    expect(screen.getByText('¿Cómo quieres aparecer?')).toBeInTheDocument();
  });
});

describe('compartir y QR', () => {
  it('copia el enlace con el origen actual cuando no hay Web Share', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PLAYER_ONBOARDED_KEY, '1');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<PublicGamesApp />);
    const shareSummaries = screen.getAllByText('Compartir y QR');
    await user.click(shareSummaries[0]);
    await user.click(screen.getAllByRole('button', { name: '🔗 Copiar enlace' })[0]);

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/juegos/cosechas`);
    expect(await screen.findByText('Enlace copiado.')).toBeInTheDocument();
  });

  it('usa navigator.share cuando existe', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PLAYER_ONBOARDED_KEY, '1');
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    render(<PublicGamesApp />);
    await user.click(screen.getAllByText('Compartir y QR')[0]);
    await user.click(screen.getAllByRole('button', { name: '📤 Compartir' })[0]);

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/juegos/cosechas` }));
  });

  it('muestra el QR con la URL del origen, no localhost fijo', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(PLAYER_ONBOARDED_KEY, '1');
    render(<PublicGamesApp />);
    await user.click(screen.getAllByText('Compartir y QR')[0]);
    await user.click(screen.getAllByRole('button', { name: /Ver QR/ })[0]);

    expect(screen.getByText('Escanea y juega')).toBeInTheDocument();
    const urlInput = screen.getByLabelText('Enlace del juego') as HTMLInputElement;
    expect(urlInput.value).toBe(`${window.location.origin}/juegos/cosechas`);
    expect(urlInput.value).not.toContain('localhost:5173');
    expect(document.querySelector('.share-qr svg')).not.toBeNull();
  });
});

describe('guardado de resultados', () => {
  const payload = {
    game_slug: 'cosechas' as const,
    difficulty: null,
    score: 120,
    duration_seconds: 30,
    metadata: { crops_collected: 12 },
  };

  it('muestra "Resultado guardado" cuando el backend responde', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { id: 'a1', game_slug: 'cosechas', difficulty: null, score: 120, created_at: '2026-10-12T10:00:00Z' },
    } as never);
    render(<ScoreReport payload={payload} />);
    expect(screen.getByText('Guardando resultado...')).toBeInTheDocument();
    expect(await screen.findByText('✅ Resultado guardado')).toBeInTheDocument();
    expect(window.localStorage.getItem(OWN_SCORE_IDS_KEY)).toContain('a1');
  });

  it('si el backend falla, muestra aviso y conserva la partida local', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 503 } });
    render(<ScoreReport payload={payload} />);
    expect(await screen.findByText(/No fue posible guardar el resultado/)).toBeInTheDocument();
    expect(screen.getByText(/Tu partida sigue disponible localmente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('reintenta el guardado al pulsar Reintentar', async () => {
    const user = userEvent.setup();
    const post = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { id: 'b2', game_slug: 'cosechas', difficulty: null, score: 120, created_at: '' } } as never);
    render(<ScoreReport payload={payload} />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('✅ Resultado guardado')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('no envía dos veces la misma partida al montar', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'c3' } } as never);
    render(<ScoreReport payload={payload} />);
    await screen.findByText('✅ Resultado guardado');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('clasificación', () => {
  it('muestra el top y destaca las partidas propias', async () => {
    window.localStorage.setItem(OWN_SCORE_IDS_KEY, JSON.stringify(['mine']));
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        data: [
          { rank: 1, id: 'other', player_alias: 'Ana', score: 300, difficulty: null, created_at: '' },
          { rank: 2, id: 'mine', player_alias: 'Jaime', score: 200, difficulty: null, created_at: '' },
        ],
      },
    } as never);

    await act(async () => {
      render(<Leaderboard slug="cosechas" />);
    });

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    const own = screen.getByText('(tú)').closest('li');
    expect(own).toHaveClass('is-own');
    expect(screen.getByText('(tú)')).toBeInTheDocument();
  });

  it('muestra error con reintento si no carga', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('down'));
    render(<Leaderboard slug="eco-puzzle" />);
    expect(await screen.findByText('No fue posible cargar la clasificación.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('muestra estado vacío sin partidas', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { data: [] } } as never);
    render(<Leaderboard slug="cosechas" />);
    expect(await screen.findByText('Aún no hay partidas. ¡Sé el primero!')).toBeInTheDocument();
  });
});
