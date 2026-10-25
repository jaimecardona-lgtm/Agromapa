import { FormEvent, useEffect, useState } from 'react';
import { GAMES, GameDefinition } from '../games/catalog';
import { Leaderboard } from '../games/Leaderboard';
import { ShareLinks } from '../games/ShareLinks';
import { formatBestScore, getBestScore } from '@/utils/bestScores';
import {
  getPlayerAlias,
  getPlayerId,
  isPlayerOnboarded,
  markPlayerOnboarded,
  setPlayerAlias,
} from '@/services/gameScores';
import { RANKING_PATH, gamePath, navigateTo } from './publicRoutes';

export function PortalPage() {
  // Crea la identidad anónima la primera vez que se entra al portal.
  useEffect(() => {
    getPlayerId();
  }, []);

  const [onboarding, setOnboarding] = useState(() => !isPlayerOnboarded());
  const [alias, setAlias] = useState(() => getPlayerAlias());

  const handleAliasSaved = (value: string) => {
    setAlias(setPlayerAlias(value));
    markPlayerOnboarded();
    setOnboarding(false);
  };

  return (
    <main className="portal">
      <section className="portal-hero">
        <p className="portal-kicker">Juegos educativos</p>
        <h1>Aprende jugando</h1>
        <p className="portal-lead">Biodiversidad, suelos, cultivos y residuos agrícolas en partidas cortas.</p>
      </section>

      {onboarding ? (
        <AliasPrompt onContinue={handleAliasSaved} />
      ) : (
        <AliasBar alias={alias} onChange={(value) => setAlias(setPlayerAlias(value))} />
      )}

      <p className="portal-ranking-link">
        <button type="button" className="ui-btn ui-btn-secondary" onClick={() => navigateTo(RANKING_PATH)}>
          🏆 Ver ranking
        </button>
      </p>
      <section className="portal-grid" aria-label="Juegos disponibles">
        {GAMES.map((game) => (
          <GameCard key={game.slug} game={game} />
        ))}
      </section>

      <section className="portal-mobile">
        <h2>Juega desde tu celular</h2>
        <p>Escanea el código QR de cada juego o comparte su enlace.</p>
      </section>
    </main>
  );
}

function AliasPrompt({ onContinue }: { onContinue: (value: string) => void }) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onContinue(value);
  };

  return (
    <form className="alias-card" onSubmit={handleSubmit}>
      <h2>¿Cómo quieres aparecer?</h2>
      <p>Opcional. Si lo dejas vacío jugarás como "Jugador".</p>
      <label className="sr-only" htmlFor="alias-input">Nombre o alias</label>
      <input
        id="alias-input"
        className="alias-input"
        type="text"
        maxLength={40}
        placeholder="Jaime"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="nickname"
      />
      <button type="submit" className="ui-btn ui-btn-primary">Continuar</button>
    </form>
  );
}

function AliasBar({ alias, onChange }: { alias: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    onChange(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="alias-bar">
        <span>Jugando como <strong>{alias}</strong></span>
        <button
          type="button"
          className="ui-btn ui-btn-ghost"
          onClick={() => {
            setDraft(alias);
            setEditing(true);
          }}
        >
          Cambiar alias
        </button>
      </div>
    );
  }

  return (
    <form className="alias-bar alias-bar-editing" onSubmit={handleSave}>
      <label className="sr-only" htmlFor="alias-edit">Nuevo alias</label>
      <input
        id="alias-edit"
        className="alias-input"
        type="text"
        maxLength={40}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className="ui-btn ui-btn-primary">Guardar</button>
      <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
    </form>
  );
}

function GameCard({ game }: { game: GameDefinition }) {
  const [showBoard, setShowBoard] = useState(false);
  const best = getBestScore(game.bestScoreKey);

  return (
    <article className="game-tile">
      <div className="tile-icon" aria-hidden="true">{game.icon}</div>
      <h2>{game.title}</h2>
      <p className="tile-desc">{game.description}</p>
      <p className="tile-best">
        {best === null ? 'Sin partidas en este dispositivo' : <>Tu mejor puntaje: <strong>{formatBestScore(best)}</strong></>}
      </p>

      <div className="tile-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateTo(gamePath(game.slug))}>
          Jugar
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={showBoard} onClick={() => setShowBoard((v) => !v)}>
          {showBoard ? 'Ocultar clasificación' : 'Ver clasificación'}
        </button>
      </div>

      {showBoard && <Leaderboard slug={game.slug} />}

      <details className="tile-share">
        <summary>Compartir y QR</summary>
        <ShareLinks path={gamePath(game.slug)} title={game.title} />
      </details>
    </article>
  );
}
