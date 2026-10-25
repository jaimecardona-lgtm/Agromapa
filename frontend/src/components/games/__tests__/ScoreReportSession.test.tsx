import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_SCORE_KEY } from '@/services/gameScores';
import { ScoreReport, SESSION_EXPIRED_MESSAGE } from '../ScoreReport';

const h = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api')>();
  return { ...actual, apiClient: { post: h.post, get: h.get } };
});

const PAYLOAD = { game_slug: 'cosechas' as const, difficulty: 'basico' as const, score: 40 };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ScoreReport con sesión expirada', () => {
  it('conserva el resultado, muestra el aviso y no reenvía solo', async () => {
    h.post.mockRejectedValueOnce({ response: { status: 401 } });
    render(<ScoreReport payload={PAYLOAD} />);

    expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument();
    expect(h.post).toHaveBeenCalledTimes(1);

    const pending = JSON.parse(window.sessionStorage.getItem(PENDING_SCORE_KEY) ?? 'null');
    expect(pending.payload).toEqual(PAYLOAD);
    expect(typeof pending.playerId).toBe('string');
  });

  it('tras iniciar sesión reintenta con el mismo player_id y limpia el resultado pendiente', async () => {
    h.post
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: { id: 'score-1', game_slug: 'cosechas', difficulty: 'basico', score: 40, created_at: '2026-10-23T10:00:00Z' } });
    render(<ScoreReport payload={PAYLOAD} />);
    await screen.findByText(SESSION_EXPIRED_MESSAGE);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar guardado' }));

    expect(await screen.findByText('✅ Resultado guardado')).toBeInTheDocument();
    expect(h.post).toHaveBeenCalledTimes(2);
    const firstBody = h.post.mock.calls[0][1];
    const retryBody = h.post.mock.calls[1][1];
    expect(retryBody.player_id).toBe(firstBody.player_id);
    expect(retryBody.score).toBe(40);
    await waitFor(() => expect(window.sessionStorage.getItem(PENDING_SCORE_KEY)).toBeNull());
  });

  it('un error distinto de 401 sigue mostrando el reintento normal, no el aviso de sesión', async () => {
    h.post.mockRejectedValueOnce({ response: { status: 503 } });
    render(<ScoreReport payload={PAYLOAD} />);

    expect(await screen.findByText(/No fue posible guardar el resultado/)).toBeInTheDocument();
    expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
  });
});
