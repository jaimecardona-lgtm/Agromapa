import { useState } from 'react';
import { QuizGame } from './QuizGame';

export function ResidueHuntersGame({ onQuit }: { onQuit: () => void }) {
  const [difficulty, setDifficulty] = useState<'basico' | 'intermedio' | 'avanzado' | 'experto' | null>(null);

  if (!difficulty) {
    return (
      <div className="difficulty-selector">
        <div className="difficulty-container">
          <h1>♻️ Cazadores de Residuos</h1>
          <p>Selecciona tu nivel de dificultad</p>

          <div className="difficulty-grid">
            <button
              className="difficulty-btn difficulty-basico"
              onClick={() => setDifficulty('basico')}
            >
              <div className="difficulty-icon">🌱</div>
              <div className="difficulty-name">Básico</div>
              <div className="difficulty-desc">Clasificación simple</div>
            </button>

            <button
              className="difficulty-btn difficulty-intermedio"
              onClick={() => setDifficulty('intermedio')}
            >
              <div className="difficulty-icon">🌍</div>
              <div className="difficulty-name">Intermedio</div>
              <div className="difficulty-desc">Escenarios rurales</div>
            </button>

            <button
              className="difficulty-btn difficulty-avanzado"
              onClick={() => setDifficulty('avanzado')}
            >
              <div className="difficulty-icon">🔬</div>
              <div className="difficulty-name">Avanzado</div>
              <div className="difficulty-desc">Impacto ambiental</div>
            </button>

            <button
              className="difficulty-btn difficulty-experto"
              onClick={() => setDifficulty('experto')}
            >
              <div className="difficulty-icon">⚗️</div>
              <div className="difficulty-name">Experto</div>
              <div className="difficulty-desc">Química ambiental</div>
            </button>
          </div>

          <button className="quit-btn" onClick={onQuit}>← Volver</button>
        </div>
      </div>
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
      onQuit={() => {
        setDifficulty(null);
        onQuit();
      }}
    />
  );
}
