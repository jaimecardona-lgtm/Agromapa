import { Difficulty } from '@/data/questionsBank';
import { DIFFICULTY_ICONS, DIFFICULTY_LABELS, DIFFICULTY_ORDER } from './difficulties';
import '../../styles/DifficultySelector.css';

interface DifficultySelectorProps {
  title: string;
  icon: string;
  subtitle: string;
  descriptions: Record<Difficulty, string>;
  onSelect: (difficulty: Difficulty) => void;
  onQuit: () => void;
}

export function DifficultySelector({ title, icon, subtitle, descriptions, onSelect, onQuit }: DifficultySelectorProps) {
  return (
    <div className="difficulty-selector">
      <div className="difficulty-container">
        <header className="difficulty-header">
          <div className="difficulty-game-icon" aria-hidden="true">{icon}</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>

        <div className="difficulty-grid">
          {DIFFICULTY_ORDER.map((level, index) => (
            <button
              key={level}
              type="button"
              className={`difficulty-card difficulty-${level}`}
              onClick={() => onSelect(level)}
            >
              <span className="difficulty-card-icon" aria-hidden="true">{DIFFICULTY_ICONS[level]}</span>
              <span className="difficulty-card-name">{DIFFICULTY_LABELS[level]}</span>
              <span className="difficulty-card-desc">{descriptions[level]}</span>
              <span className="difficulty-level" aria-label={`Nivel ${index + 1} de 4`}>
                {DIFFICULTY_ORDER.map((_, dot) => (
                  <span key={dot} className={dot <= index ? 'level-dot on' : 'level-dot'} />
                ))}
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="quit-btn" onClick={onQuit}>← Volver</button>
      </div>
    </div>
  );
}
