import { useState, useEffect, useMemo } from 'react';
import { GameShell } from '../GameShell';
import { GameResult } from '../GameResult';
import { getRandomQuestions, shuffleOptions, Difficulty } from '@/data/questionsBank';
import { GameSlug } from '@/services/gameScores';
import { getBestScore, setBestScore } from '@/utils/bestScores';
import { DIFFICULTY_LABELS } from './difficulties';
import {
  FEEDBACK_MS,
  MAX_LIVES,
  advanceQuiz,
  answerQuestion,
  createQuizState,
  getQuizRating,
  precision,
  tickQuestionTimer,
  QuizState,
} from './quizEngine';
import '../../styles/games/QuizGame.css';

interface QuizGameProps {
  title: string;
  icon: string;
  difficulty: Difficulty;
  questionsPerRound: number;
  timePerQuestion: number;
  storageKey: 'ecoPuzzle' | 'residuos';
  gameSlug: GameSlug;
  onQuit: () => void;
  onChangeDifficulty: () => void;
}

function Hearts({ lives }: { lives: number }) {
  return (
    <span className="quiz-hearts" aria-label={`${lives} de ${MAX_LIVES} vidas`}>
      {Array.from({ length: MAX_LIVES }, (_, i) => (
        <span key={i} className={i < lives ? 'heart' : 'heart heart-lost'}>
          {i < lives ? '❤️' : '🤍'}
        </span>
      ))}
    </span>
  );
}

export function QuizGame({
  title,
  icon,
  difficulty,
  questionsPerRound,
  timePerQuestion,
  storageKey,
  gameSlug,
  onQuit,
  onChangeDifficulty,
}: QuizGameProps) {
  const [questions, setQuestions] = useState(() => getRandomQuestions(questionsPerRound, difficulty));
  const [state, setState] = useState<QuizState>(() => createQuizState(timePerQuestion));

  const currentQuestion = questions[state.index];
  const shuffledOptions = useMemo(
    () => (currentQuestion ? shuffleOptions(currentQuestion) : []),
    [currentQuestion],
  );

  // Temporizador de la pregunta actual.
  useEffect(() => {
    if (state.phase !== 'question' || !currentQuestion) return;
    const id = setInterval(() => {
      setState((prev) => tickQuestionTimer(prev, currentQuestion.correctAnswerId, timePerQuestion));
    }, 1000);
    return () => clearInterval(id);
  }, [state.phase, currentQuestion, timePerQuestion]);

  // Feedback visible antes de avanzar (no avanza instantáneamente).
  useEffect(() => {
    if (state.phase !== 'feedback') return;
    const id = setTimeout(() => {
      setState((prev) => advanceQuiz(prev, questions.length, timePerQuestion));
    }, FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [state.phase, questions.length, timePerQuestion]);

  // Fin de partida: guarda el mejor puntaje una vez.
  useEffect(() => {
    if (state.phase === 'ended') setBestScore(storageKey, state.score);
  }, [state.phase, state.score, storageKey]);

  const handleAnswer = (optionId: string) => {
    if (!currentQuestion) return;
    setState((prev) => answerQuestion(prev, optionId, currentQuestion.correctAnswerId, timePerQuestion));
  };

  const handleRestart = () => {
    setQuestions(getRandomQuestions(questionsPerRound, difficulty));
    setState(createQuizState(timePerQuestion));
  };

  if (!questions.length) {
    return <div className="quiz-loading">No hay preguntas disponibles para este nivel.</div>;
  }

  const difficultyLabel = DIFFICULTY_LABELS[difficulty];

  if (state.phase === 'ended') {
    const rating = getQuizRating(state);
    const bestScore = Math.max(getBestScore(storageKey) ?? 0, state.score);
    return (
      <GameResult
        score={state.score}
        title={title}
        onRestart={handleRestart}
        onChangeDifficulty={onChangeDifficulty}
        onQuit={onQuit}
        rating={rating}
        scoreReport={{
          game_slug: gameSlug,
          difficulty,
          score: state.score,
          correct_answers: state.correct,
          wrong_answers: state.wrong,
          best_streak: state.bestStreak,
          lives_remaining: state.lives,
          duration_seconds: state.elapsedSeconds,
          metadata: { questions_per_round: questions.length, time_per_question: timePerQuestion },
        }}
        stats={[
          { label: 'Aciertos', value: state.correct },
          { label: 'Errores', value: state.wrong },
          { label: 'Precisión', value: `${precision(state)}%` },
          { label: 'Mejor Racha', value: state.bestStreak },
          { label: 'Vidas restantes', value: `${state.lives}/${MAX_LIVES}` },
          { label: 'Dificultad', value: difficultyLabel },
          { label: 'Mejor puntuación', value: bestScore },
        ]}
      />
    );
  }

  const answered = state.phase !== 'question';
  const correctId = currentQuestion.correctAnswerId;
  const correctText = currentQuestion.options.find((o) => o.id === correctId)?.text;
  const progress = ((state.index + (answered ? 1 : 0)) / questions.length) * 100;

  return (
    <GameShell
      title={`${icon} ${title}`}
      onQuit={onQuit}
      score={state.score}
      timeLeft={state.timeLeft}
      maxTime={timePerQuestion}
    >
      <div className="quiz-game">
        <div className="quiz-hud">
          <div className="hud-item">
            <span className="hud-label">Pregunta</span>
            <span className="hud-value">{state.index + 1} / {questions.length}</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">Vidas</span>
            <Hearts lives={state.lives} />
          </div>
          <div className="hud-item">
            <span className="hud-label">Racha</span>
            <span className="hud-value">🔥 {state.streak}</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">Dificultad</span>
            <span className="hud-value">{difficultyLabel}</span>
          </div>
        </div>

        <div className="quiz-progress">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="question-enter" key={state.index}>
          <div className="question-card">
            <div className="difficulty-badge" data-difficulty={currentQuestion.difficulty}>
              {currentQuestion.difficulty.toUpperCase()}
            </div>

            <h2 className="question-text">{currentQuestion.question}</h2>

            <div className="options-grid">
              {shuffledOptions.map((option, position) => {
                let btnClass = 'option-btn';
                if (answered) {
                  if (option.id === correctId) btnClass += ' correct';
                  else if (option.id === state.selectedId) btnClass += ' incorrect';
                  else btnClass += ' disabled';
                }
                return (
                  <button
                    key={option.id}
                    className={btnClass}
                    onClick={() => handleAnswer(option.id)}
                    disabled={answered}
                  >
                    <span className="option-letter">{String.fromCharCode(65 + position)}</span>
                    <span className="option-text">{option.text}</span>
                  </button>
                );
              })}
            </div>

            {answered && (
              <div className={`result-feedback ${state.lastCorrect ? 'success' : 'error'}`} role="status">
                {state.lastCorrect ? (
                  <div className="feedback-header">
                    ✅ ¡Correcto! <span className="feedback-points">+{state.lastPoints}</span>
                  </div>
                ) : (
                  <div className="feedback-header">
                    ❌ {state.selectedId === null ? 'Tiempo agotado' : 'Incorrecto'}
                    <span className="feedback-lives">❤️ -1</span>
                  </div>
                )}
                {!state.lastCorrect && (
                  <div className="feedback-body">
                    <p>Respuesta correcta: <strong>{correctText}</strong></p>
                  </div>
                )}
                <div className="feedback-explanation">{currentQuestion.explanation}</div>
                {state.lives === 0 && <div className="feedback-end">Sin vidas: la partida termina.</div>}
              </div>
            )}
          </div>
        </div>

        <div className="time-bar">
          <div className="time-fill" style={{ width: `${(state.timeLeft / timePerQuestion) * 100}%` }} />
          <div className="time-text">{state.timeLeft}s</div>
        </div>
      </div>
    </GameShell>
  );
}
