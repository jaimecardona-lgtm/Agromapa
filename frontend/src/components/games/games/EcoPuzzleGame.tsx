import { useState } from 'react';
import { QuizGame } from './QuizGame';

export function EcoPuzzleGame({ onQuit }: { onQuit: () => void }) {
  const [difficulty, setDifficulty] = useState<'basico' | 'intermedio' | 'avanzado' | 'experto' | null>(null);

  if (!difficulty) {
    return (
      <div className="difficulty-selector">
        <div className="difficulty-container">
          <h1>🧩 Eco-Puzzle de Conexiones</h1>
          <p>Selecciona tu nivel de dificultad</p>

          <div className="difficulty-grid">
            <button
              className="difficulty-btn difficulty-basico"
              onClick={() => setDifficulty('basico')}
            >
              <div className="difficulty-icon">🌱</div>
              <div className="difficulty-name">Básico</div>
              <div className="difficulty-desc">Biodiversidad general</div>
            </button>

            <button
              className="difficulty-btn difficulty-intermedio"
              onClick={() => setDifficulty('intermedio')}
            >
              <div className="difficulty-icon">🌿</div>
              <div className="difficulty-name">Intermedio</div>
              <div className="difficulty-desc">Agronomía y relaciones</div>
            </button>

            <button
              className="difficulty-btn difficulty-avanzado"
              onClick={() => setDifficulty('avanzado')}
            >
              <div className="difficulty-icon">🧪</div>
              <div className="difficulty-name">Avanzado</div>
              <div className="difficulty-desc">Química y biología</div>
            </button>

            <button
              className="difficulty-btn difficulty-experto"
              onClick={() => setDifficulty('experto')}
            >
              <div className="difficulty-icon">🔬</div>
              <div className="difficulty-name">Experto</div>
              <div className="difficulty-desc">Preguntas técnicas</div>
            </button>
          </div>

          <button className="quit-btn" onClick={onQuit}>← Volver</button>
        </div>
      </div>
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
      onQuit={() => {
        setDifficulty(null);
        onQuit();
      }}
    />
  );
}
