import { useState } from 'react';
import { RANKING_PATH, navigateTo } from '../public/publicRoutes';
import { CosechasGame } from './games/CosechasGame';
import { EcoPuzzleGame } from './games/EcoPuzzleGame';
import { ResidueHuntersGame } from './games/ResidueHuntersGame';
import '../styles/LearnGames.css';

type GameType = 'landing' | 'cosechas' | 'eco-puzzle' | 'residuos';

export function LearnGames() {
  const [currentGame, setCurrentGame] = useState<GameType>('landing');

  const handleGameStart = (game: GameType) => {
    setCurrentGame(game);
  };

  const handleQuit = () => {
    setCurrentGame('landing');
  };

  if (currentGame === 'cosechas') {
    return <CosechasGame onQuit={handleQuit} />;
  }

  if (currentGame === 'eco-puzzle') {
    return <EcoPuzzleGame onQuit={handleQuit} />;
  }

  if (currentGame === 'residuos') {
    return <ResidueHuntersGame onQuit={handleQuit} />;
  }

  return (
    <div className="learn-games">
      <div className="learn-header">
        <h1>🎮 Aprende Jugando</h1>
        <p>Descubre la biodiversidad, territorio y bioeconomía a través de juegos educativos</p>
        <button type="button" className="learn-ranking-link" onClick={() => navigateTo(RANKING_PATH)}>
          🏆 Ranking
        </button>
      </div>

      <div className="games-grid">
        <div className="game-card" onClick={() => handleGameStart('cosechas')}>
          <div className="card-icon">🌾</div>
          <h3>Cosechas</h3>
          <p className="card-description">
            Recolecta los cultivos correctos en tu canasta agrícola.
          </p>
          <p className="card-objective">
            Objetivo: Reconocer cultivos principales y comprender la producción agrícola
          </p>
          <button className="play-btn">Jugar</button>
          <a className="standalone-link" href="/juegos/cosechas" onClick={(event) => event.stopPropagation()}>Abrir como juego independiente</a>
        </div>

        <div className="game-card" onClick={() => handleGameStart('eco-puzzle')}>
          <div className="card-icon">🧩</div>
          <h3>Eco-Puzzle de Conexiones</h3>
          <p className="card-description">
            Conecta los elementos de la cadena de biodiversidad y bioeconomía.
          </p>
          <p className="card-objective">
            Objetivo: Comprender las relaciones entre plantas, polinizadores, productores y productos
          </p>
          <button className="play-btn">Jugar</button>
          <a className="standalone-link" href="/juegos/eco-puzzle" onClick={(event) => event.stopPropagation()}>Abrir como juego independiente</a>
        </div>

        <div className="game-card" onClick={() => handleGameStart('residuos')}>
          <div className="card-icon">♻️</div>
          <h3>Cazadores de Residuos</h3>
          <p className="card-description">
            Clasifica correctamente los residuos agrícolas según su tipo.
          </p>
          <p className="card-objective">
            Objetivo: Aprender el manejo responsable de residuos rurales y agroambientales
          </p>
          <button className="play-btn">Jugar</button>
          <a className="standalone-link" href="/juegos/cazadores-residuos" onClick={(event) => event.stopPropagation()}>Abrir como juego independiente</a>
        </div>
      </div>
    </div>
  );
}
