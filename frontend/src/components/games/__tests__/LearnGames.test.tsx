import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnGames } from '../LearnGames';

describe('LearnGames', () => {
  it('renders landing page with game header', () => {
    render(<LearnGames />);
    expect(screen.getByText('🎮 Aprende Jugando')).toBeInTheDocument();
  });

  it('renders three game cards', () => {
    render(<LearnGames />);
    expect(screen.getByText('Cosechas')).toBeInTheDocument();
    expect(screen.getByText('Eco-Puzzle de Conexiones')).toBeInTheDocument();
    expect(screen.getByText('Cazadores de Residuos')).toBeInTheDocument();
  });

  it('shows play buttons for each game', () => {
    render(<LearnGames />);
    const playButtons = screen.getAllByRole('button', { name: 'Jugar' });
    expect(playButtons).toHaveLength(3);
  });

  it('navigates to Cosechas game when clicking first play button', async () => {
    const user = userEvent.setup();
    render(<LearnGames />);
    const playButtons = screen.getAllByRole('button', { name: 'Jugar' });
    await user.click(playButtons[0]);

    // Cosechas doesn't have difficulty selector, should show game directly
    expect(screen.queryByText('🎮 Aprende Jugando')).not.toBeInTheDocument();
  });

  it('can navigate to EcoPuzzle game with difficulty selector', async () => {
    const user = userEvent.setup();
    render(<LearnGames />);
    const playButtons = screen.getAllByRole('button', { name: 'Jugar' });
    await user.click(playButtons[1]);

    // Should show difficulty selector
    expect(screen.getByText('Selecciona tu nivel de dificultad')).toBeInTheDocument();
  });

  it('can navigate to ResidueHunters game with difficulty selector', async () => {
    const user = userEvent.setup();
    render(<LearnGames />);
    const playButtons = screen.getAllByRole('button', { name: 'Jugar' });
    await user.click(playButtons[2]);

    // Should show difficulty selector
    expect(screen.getByText('Selecciona tu nivel de dificultad')).toBeInTheDocument();
  });
});
