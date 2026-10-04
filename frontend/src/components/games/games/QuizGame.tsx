import { useState, useEffect, useCallback } from 'react';
import { GameShell } from '../GameShell';
import { GameResult } from '../GameResult';
import { getRandomQuestions, shuffleOptions, Question, Difficulty } from '@/data/questionsBank';
import { setBestScore } from '@/utils/bestScores';
import '../../styles/games/QuizGame.css';

interface QuizGameProps {
  title: string;
  icon: string;
  difficulty: Difficulty;
  questionsPerRound: number;
  timePerQuestion: number;
  storageKey: 'ecoPuzzle' | 'residuos';
  onQuit: () => void;
}

interface QuizState {
  currentQuestionIndex: number;
  score: number;
  streak: number;
  bestStreak: number;
  answeredCount: number;
  correctCount: number;
  questions: Question[];
  selectedAnswer: string | null;
  showingResult: boolean;
  timeLeft: number;
  gameEnded: boolean;
}

export function QuizGame({ title, icon, difficulty, questionsPerRound, timePerQuestion, storageKey, onQuit }: QuizGameProps) {
  const [gameState, setGameState] = useState<QuizState>({
    currentQuestionIndex: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    answeredCount: 0,
    correctCount: 0,
    questions: getRandomQuestions(questionsPerRound, difficulty),
    selectedAnswer: null,
    showingResult: false,
    timeLeft: timePerQuestion,
    gameEnded: false,
  });

  const getRating = (score: number): { icon: string; label: string } => {
    const maxScore = gameState.questions.length * 100;
    const percentage = (score / maxScore) * 100;

    if (percentage >= 80) return { icon: '🏆', label: 'Maestro Raíces' };
    if (percentage >= 60) return { icon: '🧪', label: 'Especialista' };
    if (percentage >= 40) return { icon: '🌾', label: 'Conocedor' };
    if (percentage >= 20) return { icon: '🌿', label: 'Aprendiz' };
    return { icon: '🌱', label: 'Explorador' };
  };

  const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
  const shuffledOptions = currentQuestion ? shuffleOptions(currentQuestion) : [];

  // Timer
  useEffect(() => {
    if (gameState.gameEnded || gameState.showingResult || !gameState.selectedAnswer) return;

    const timer = setTimeout(() => {
      handleNextQuestion();
    }, 1500);

    return () => clearTimeout(timer);
  }, [gameState.selectedAnswer, gameState.showingResult, gameState.gameEnded]);

  // Question timer
  useEffect(() => {
    if (gameState.gameEnded || gameState.selectedAnswer || !gameState.questions.length) return;

    const timer = setInterval(() => {
      setGameState((prev) => {
        const newTime = Math.max(0, prev.timeLeft - 1);
        if (newTime === 0) {
          return {
            ...prev,
            selectedAnswer: 'timeout',
            showingResult: true,
          };
        }
        return { ...prev, timeLeft: newTime };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.selectedAnswer, gameState.gameEnded]);

  const handleAnswerClick = useCallback((optionId: string) => {
    if (gameState.selectedAnswer || gameState.showingResult) return;

    const isCorrect = optionId === currentQuestion.correctAnswerId;
    const baseScore = 100;
    const speedBonus = Math.floor((gameState.timeLeft / timePerQuestion) * 50);
    const streakBonus = gameState.streak >= 3 ? 25 : 0;
    const totalPoints = isCorrect ? baseScore + speedBonus + streakBonus : 0;

    setGameState((prev) => ({
      ...prev,
      selectedAnswer: optionId,
      showingResult: true,
      score: prev.score + totalPoints,
      streak: isCorrect ? prev.streak + 1 : 0,
      bestStreak: isCorrect ? Math.max(prev.bestStreak, prev.streak + 1) : prev.bestStreak,
      correctCount: isCorrect ? prev.correctCount + 1 : prev.correctCount,
      answeredCount: prev.answeredCount + 1,
    }));
  }, [gameState.selectedAnswer, gameState.showingResult, gameState.streak, gameState.timeLeft, currentQuestion, timePerQuestion]);

  const handleNextQuestion = useCallback(() => {
    setGameState((prev) => {
      const nextIndex = prev.currentQuestionIndex + 1;

      if (nextIndex >= prev.questions.length) {
        return {
          ...prev,
          gameEnded: true,
        };
      }

      return {
        ...prev,
        currentQuestionIndex: nextIndex,
        selectedAnswer: null,
        showingResult: false,
        timeLeft: timePerQuestion,
      };
    });
  }, [timePerQuestion]);

  const handleRestart = () => {
    setGameState({
      currentQuestionIndex: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      answeredCount: 0,
      correctCount: 0,
      questions: getRandomQuestions(questionsPerRound, difficulty),
      selectedAnswer: null,
      showingResult: false,
      timeLeft: timePerQuestion,
      gameEnded: false,
    });
  };

  if (!gameState.questions.length) {
    return <div className="quiz-loading">Cargando preguntas...</div>;
  }

  if (gameState.gameEnded) {
    const rating = getRating(gameState.score);
    setBestScore(storageKey, gameState.score);

    return (
      <GameResult
        score={gameState.score}
        title={title}
        onRestart={handleRestart}
        onQuit={onQuit}
        rating={rating}
        stats={[
          { label: 'Aciertos', value: `${gameState.correctCount}/${gameState.answeredCount}` },
          { label: 'Precisión', value: `${Math.round((gameState.correctCount / gameState.answeredCount) * 100)}%` },
          { label: 'Mejor Racha', value: gameState.bestStreak },
        ]}
      />
    );
  }

  const isAnswered = gameState.selectedAnswer !== null;
  const isCorrect = isAnswered && gameState.selectedAnswer === currentQuestion.correctAnswerId;
  const progress = ((gameState.currentQuestionIndex + 1) / gameState.questions.length) * 100;

  return (
    <GameShell
      title={`${icon} ${title}`}
      onQuit={onQuit}
      score={gameState.score}
      timeLeft={gameState.timeLeft}
      maxTime={timePerQuestion}
    >
      <div className="quiz-game">
        {/* Progress Bar */}
        <div className="quiz-progress">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-text">
            Pregunta {gameState.currentQuestionIndex + 1} / {gameState.questions.length}
          </div>
        </div>

        {/* Streak */}
        {gameState.streak >= 3 && (
          <div className="streak-banner">
            🔥 RACHA x{gameState.streak}
          </div>
        )}

        {/* Question Card */}
        <div className="question-card">
          <div className="difficulty-badge" data-difficulty={currentQuestion.difficulty}>
            {currentQuestion.difficulty.toUpperCase()}
          </div>

          <h2 className="question-text">{currentQuestion.question}</h2>

          {/* Options */}
          <div className="options-grid">
            {shuffledOptions.map((option) => {
              const isSelected = gameState.selectedAnswer === option.id;
              const isCorrectOption = option.id === currentQuestion.correctAnswerId;

              let btnClass = 'option-btn';
              if (isAnswered) {
                if (isCorrectOption) {
                  btnClass += ' correct';
                } else if (isSelected && !isCorrect) {
                  btnClass += ' incorrect';
                } else {
                  btnClass += ' disabled';
                }
              }

              return (
                <button
                  key={option.id}
                  className={btnClass}
                  onClick={() => handleAnswerClick(option.id)}
                  disabled={isAnswered}
                >
                  <span className="option-letter">
                    {String.fromCharCode(65 + shuffledOptions.indexOf(option))}
                  </span>
                  <span className="option-text">{option.text}</span>
                </button>
              );
            })}
          </div>

          {/* Result Feedback */}
          {isAnswered && (
            <div className={`result-feedback ${isCorrect ? 'success' : 'error'}`}>
              <div className="feedback-header">
                {isCorrect ? '✅ ¡Correcto!' : '❌ Incorrecto'}
              </div>
              {!isCorrect && (
                <div className="feedback-body">
                  <p>Respuesta correcta: <strong>{currentQuestion.options.find(o => o.id === currentQuestion.correctAnswerId)?.text}</strong></p>
                </div>
              )}
              <div className="feedback-explanation">
                {currentQuestion.explanation}
              </div>
            </div>
          )}
        </div>

        {/* Time Bar */}
        <div className="time-bar">
          <div className="time-fill" style={{ width: `${(gameState.timeLeft / timePerQuestion) * 100}%` }} />
          <div className="time-text">{gameState.timeLeft}s</div>
        </div>
      </div>
    </GameShell>
  );
}
