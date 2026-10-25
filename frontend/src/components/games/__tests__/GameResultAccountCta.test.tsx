import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, defaultAuthValue, type AuthContextValue } from '@/auth/AuthContext';
import { GameResult } from '../GameResult';

// El reporte de puntaje hace llamadas de red; aquí solo importa la CTA.
vi.mock('../ScoreReport', () => ({ ScoreReport: () => null }));

const CTA_TEXT = '¿Quieres guardar tu puntaje y competir con otros jugadores? Regístrate.';

function renderResult(auth: Partial<AuthContextValue>, withReport = true) {
  const value: AuthContextValue = { ...defaultAuthValue, configured: true, ...auth };
  render(
    <AuthContext.Provider value={value}>
      <GameResult
        title="Cosechas"
        score={1200}
        onRestart={() => undefined}
        onQuit={() => undefined}
        scoreReport={withReport ? { game_slug: 'cosechas', difficulty: null, score: 1200 } : undefined}
      />
    </AuthContext.Provider>,
  );
}

describe('GameResult - CTA de cuenta', () => {
  it('invites a guest with a saved score to create an account or sign in', () => {
    renderResult({ status: 'anonymous' });

    expect(screen.getByText(CTA_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('does not show the CTA to an authenticated player', () => {
    renderResult({ status: 'authenticated', user: { id: 'user-1', email: null }, roles: [] });
    expect(screen.queryByText(CTA_TEXT)).not.toBeInTheDocument();
  });

  it('does not block the game: the result and replay buttons still render for guests', () => {
    renderResult({ status: 'anonymous' });
    expect(screen.getByRole('button', { name: /Jugar otra vez/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Volver/ })).toBeInTheDocument();
  });

  it('does not show the CTA when the score was not saved', () => {
    renderResult({ status: 'anonymous' }, false);
    expect(screen.queryByText(CTA_TEXT)).not.toBeInTheDocument();
  });

  it('does not show the CTA when accounts are not configured', () => {
    renderResult({ status: 'anonymous', configured: false });
    expect(screen.queryByText(CTA_TEXT)).not.toBeInTheDocument();
  });
});
