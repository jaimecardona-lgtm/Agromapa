import { useState } from 'react';
import { Difficulty } from '@/data/questionsBank';
import { QuizGame } from './QuizGame';
import { DifficultySelector } from './DifficultySelector';

const DESCRIPTIONS: Record<Difficulty, string> = {
  basico: 'Clasificación simple',
  intermedio: 'Escenarios rurales',
  avanzado: 'Impacto ambiental',
  experto: 'Química ambiental',
};

export function ResidueHuntersGame({ onQuit }: { onQuit: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  if (!difficulty) {
    return (
      <DifficultySelector
        title="Cazadores de Residuos"
        icon="♻️"
        subtitle="Selecciona tu nivel de dificultad"
        descriptions={DESCRIPTIONS}
        onSelect={setDifficulty}
        onQuit={onQuit}
      />
    );
  }

  return (
    <QuizGame
      title="Cazadores de Residuos"
      icon="♻️"
      difficulty={difficulty}
      questionsPerRound={6}
      timePerQuestion={25}
      storageKey="residuos"
      gameSlug="cazadores-residuos"
      onChangeDifficulty={() => setDifficulty(null)}
      onQuit={() => {
        setDifficulty(null);
        onQuit();
      }}
    />
  );
}
