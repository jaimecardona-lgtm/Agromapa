import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { AuthPrompt } from '@/components/auth/AuthPrompt';
import { api, type GeoUnit } from '@/services/api';
import {
  GAME_LABELS,
  rankingsApi,
  type MyRankingResponse,
  type RankingGame,
  type RankingResponse,
  type RankingScope,
} from '@/services/rankings';
import '../styles/Ranking.css';

const GAMES: RankingGame[] = ['general', 'cosechas', 'eco-puzzle', 'cazadores-residuos'];
const MEDALS = ['🥇', '🥈', '🥉'];
const LIMIT = 20;

type LoadState = 'loading' | 'ready' | 'error';

/** Ranking público de juegos educativos. Sin premios ni puntos canjeables. */
export function RankingPage() {
  const { status } = useAuth();
  const [game, setGame] = useState<RankingGame>('general');
  const [scope, setScope] = useState<RankingScope>('national');
  const [departmentCode, setDepartmentCode] = useState('');
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [departments, setDepartments] = useState<GeoUnit[]>([]);
  const [municipalities, setMunicipalities] = useState<GeoUnit[]>([]);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [mine, setMine] = useState<MyRankingResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.territories
      .getDepartments()
      .then((res) => {
        if (!cancelled) setDepartments(res.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!departmentCode) {
      setMunicipalities([]);
      return undefined;
    }
    let cancelled = false;
    api.territories
      .getMunicipalities(departmentCode)
      .then((res) => {
        if (!cancelled) setMunicipalities(res.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setMunicipalities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentCode]);

  const needsDepartment = scope !== 'national' && !departmentCode;
  const needsMunicipality = scope === 'municipality' && !municipalityCode;

  useEffect(() => {
    if (needsDepartment || needsMunicipality) return undefined;
    let cancelled = false;
    setState('loading');
    rankingsApi
      .get({
        scope,
        game,
        department_code: scope !== 'national' ? departmentCode : undefined,
        municipality_code: scope === 'municipality' ? municipalityCode : undefined,
        limit: LIMIT,
      })
      .then((res) => {
        if (!cancelled) {
          setRanking(res.data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [scope, game, departmentCode, municipalityCode, needsDepartment, needsMunicipality, attempt]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setMine(null);
      return undefined;
    }
    let cancelled = false;
    rankingsApi
      .me()
      .then((res) => {
        if (!cancelled) setMine(res.data);
      })
      .catch(() => {
        if (!cancelled) setMine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const departmentName = (code: string | null) => departments.find((d) => d.dane_code === code)?.name ?? null;

  return (
    <main className="ranking-page" aria-labelledby="ranking-title">
      <header className="ranking-header">
        <p className="ranking-kicker">Aprende jugando</p>
        <h1 id="ranking-title">Ranking Raíces Conectadas</h1>
        <p className="ranking-note">
          Competencia educativa: cada jugador aparece con su mejor puntaje. No hay premios ni puntos canjeables.
        </p>
      </header>

      <div className="ranking-tabs" role="tablist" aria-label="Juego">
        {GAMES.map((slug) => (
          <button
            key={slug}
            type="button"
            role="tab"
            aria-selected={game === slug}
            className={`ranking-tab ${game === slug ? 'active' : ''}`}
            onClick={() => setGame(slug)}
          >
            {GAME_LABELS[slug]}
          </button>
        ))}
      </div>

      <form className="ranking-filters" onSubmit={(event) => event.preventDefault()}>
        <label className="ranking-field" htmlFor="ranking-scope">
          <span>Alcance</span>
          <select
            id="ranking-scope"
            name="scope"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as RankingScope);
              setMunicipalityCode('');
            }}
          >
            <option value="national">Colombia</option>
            <option value="department">Departamento</option>
            <option value="municipality">Municipio</option>
          </select>
        </label>
        {scope !== 'national' && (
          <label className="ranking-field" htmlFor="ranking-department">
            <span>Departamento</span>
            <select
              id="ranking-department"
              name="department_code"
              value={departmentCode}
              onChange={(event) => {
                setDepartmentCode(event.target.value);
                setMunicipalityCode('');
              }}
            >
              <option value="">Elige un departamento</option>
              {departments.map((dept) => (
                <option key={dept.dane_code} value={dept.dane_code}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === 'municipality' && departmentCode && (
          <label className="ranking-field" htmlFor="ranking-municipality">
            <span>Municipio</span>
            <select
              id="ranking-municipality"
              name="municipality_code"
              value={municipalityCode}
              onChange={(event) => setMunicipalityCode(event.target.value)}
            >
              <option value="">Elige un municipio</option>
              {municipalities.map((mun) => (
                <option key={mun.dane_code} value={mun.dane_code}>
                  {mun.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>

      {status === 'authenticated' && mine && <MyPosition mine={mine} game={game} />}
      {status === 'anonymous' && (
        <section className="ranking-cta" aria-label="Guarda tu puntaje">
          <p>Guarda tu puntaje y compite en el ranking.</p>
          <AuthPrompt message="Crea una cuenta para guardar tus partidas y aparecer en el ranking." defaultChoice="buyer" />
        </section>
      )}

      {needsDepartment && <p className="ranking-empty">Elige un departamento para ver su ranking.</p>}
      {!needsDepartment && needsMunicipality && <p className="ranking-empty">Elige un municipio para ver su ranking.</p>}

      {!needsDepartment && !needsMunicipality && state === 'loading' && (
        <p className="ranking-status">Cargando ranking…</p>
      )}

      {!needsDepartment && !needsMunicipality && state === 'error' && (
        <section className="ranking-error" role="alert">
          <p>No pudimos cargar el ranking.</p>
          <button type="button" className="ranking-action" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </section>
      )}

      {!needsDepartment && !needsMunicipality && state === 'ready' && ranking && (
        <section className="ranking-results" aria-labelledby="ranking-list-title">
          <h2 id="ranking-list-title">
            {GAME_LABELS[game]} · {scopeLabel(ranking, departmentName)}
          </h2>
          {ranking.entries.length === 0 ? (
            <p className="ranking-empty">Todavía no hay jugadores clasificados aquí. ¡Sé el primero!</p>
          ) : (
            <ol className="ranking-list">
              {ranking.entries.map((entry) => (
                <li key={`${entry.rank}-${entry.display_name}-${entry.score}`} className={`ranking-row ${entry.is_me ? 'ranking-row--me' : ''}`}>
                  <span className="ranking-position" aria-label={`Posición ${entry.rank}`}>
                    {entry.rank <= MEDALS.length ? MEDALS[entry.rank - 1] : `#${entry.rank}`}
                  </span>
                  <span className="ranking-name">
                    {entry.display_name}
                    {entry.is_me && <span className="ranking-me-tag"> (tú)</span>}
                  </span>
                  <span className="ranking-score">{entry.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}

function scopeLabel(ranking: RankingResponse, departmentName: (code: string | null) => string | null): string {
  if (ranking.scope === 'municipality') return ranking.territory.municipality_name ?? 'Municipio';
  if (ranking.scope === 'department') return ranking.territory.department_name ?? departmentName(ranking.territory.department_code) ?? 'Departamento';
  return 'Colombia';
}

function MyPosition({ mine, game }: { mine: MyRankingResponse; game: RankingGame }) {
  const best = game === 'general' ? mine.general : (mine.best[game] ?? null);
  return (
    <section className="ranking-mine" aria-labelledby="ranking-mine-title">
      <h2 id="ranking-mine-title">Tu posición</h2>
      <p className="ranking-note">Posiciones del ranking general.</p>
      {!mine.has_scores && <p>Juega una partida para aparecer en el ranking.</p>}
      {mine.has_scores && (
        <>
          <p>
            Mejor puntaje en {GAME_LABELS[game]}: <strong>{best ?? 'sin partidas'}</strong>
          </p>
          <ul className="ranking-positions">
            <li>
              Municipio:{' '}
              {mine.positions.municipality ? (
                <strong>
                  #{mine.positions.municipality.rank} de {mine.positions.municipality.of}
                </strong>
              ) : mine.missing_territory.includes('municipality') ? (
                'Completa tu municipio en Mi cuenta para participar en el ranking municipal.'
              ) : (
                'Sin posición todavía'
              )}
            </li>
            <li>
              Departamento:{' '}
              {mine.positions.department ? (
                <strong>
                  #{mine.positions.department.rank} de {mine.positions.department.of}
                </strong>
              ) : mine.missing_territory.includes('department') ? (
                'Completa tu departamento en Mi cuenta para participar en el ranking departamental.'
              ) : (
                'Sin posición todavía'
              )}
            </li>
            <li>
              Colombia:{' '}
              {mine.positions.national ? (
                <strong>
                  #{mine.positions.national.rank} de {mine.positions.national.of}
                </strong>
              ) : (
                'Sin posición todavía'
              )}
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
