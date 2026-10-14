import { useState } from 'react';
import { Difficulty } from '@/data/questionsBank';
import { QuizGame } from './QuizGame';
import { DifficultySelector } from './DifficultySelector';

const DESCRIPTIONS: Record<Difficulty, string> = {
  basico: 'Biodiversidad general',
  intermedio: 'Agronomía y relaciones',
  avanzado: 'Química y biología',
  experto: 'Preguntas técnicas',
};

export function EcoPuzzleGame({ onQuit }: { onQuit: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  if (!difficulty) {
    return (
      <DifficultySelector
        title="Eco-Puzzle de Conexiones"
        icon="🧩"
        subtitle="Selecciona tu nivel de dificultad"
        descriptions={DESCRIPTIONS}
        onSelect={setDifficulty}
        onQuit={onQuit}
      />
    );
  }

  return (
    <QuizGame
      title="Eco-Puzzle de Conexiones"
      icon="🧩"
      difficulty={difficulty}
      questionsPerRound={5}
      timePerQuestion={20}
      storageKey="ecoPuzzle"
      gameSlug="eco-puzzle"
      onChangeDifficulty={() => setDifficulty(null)}
      onQuit={() => {
        setDifficulty(null);
        onQuit();
      }}
    />
  );
}
