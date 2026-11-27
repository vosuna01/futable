import type { CSSProperties } from "react";
import type { Player, Team } from "../domain/types";
import type { goalCelebration } from "../domain/goal-celebration";
import { teamNames } from "../domain/teams";
import { CharacterOutfit } from "./CharacterOutfit";
import { Avatar } from "./ui";
import "./goal-celebration.css";
export function GoalCelebration({
  celebration,
  player,
  score,
  items = [],
}: {
  celebration: NonNullable<ReturnType<typeof goalCelebration>>;
  player?: Player;
  score: Record<Team, number>;
  items?: string[];
}) {
  const { team, level, title, streak, duration, scorerGoals } = celebration;
  return (
    <div
      className={`tablet-cheer goal-celebration ${team} lvl-${level}`}
      style={{ "--cheer-duration": `${duration}ms` } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="goal-rings" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="goal-confetti" aria-hidden="true">
        {Array.from({ length: 10 + level * 3 }, (_, i) => (
          <i
            key={i}
            style={
              {
                "--n": i,
                "--x": `${(i * 37) % 100}%`,
                "--delay": `${(i % 5) * 0.06}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="goal-card">
        <div className="goal-character tablet-cheer-face">
          {player ? (
            <CharacterOutfit player={player} mood="goal" items={items} />
          ) : (
            <Avatar
              player={{ name: teamNames[team], avatar_url: null }}
              size="large"
            />
          )}
        </div>
        <div className="goal-copy">
          <span className="goal-kicker">
            {teamNames[team]} <i /> GOL CONFIRMADO
          </span>
          <strong className="tablet-cheer-title">{title}</strong>
          <span className="tablet-cheer-name">
            {player?.name || `Gol del ${teamNames[team]}`}
          </span>
          <span className="goal-detail">
            {scorerGoals > 1
              ? `${scorerGoals} goles en esta partida`
              : "La pista tiene protagonista"}
            {streak > 1 && (
              <b className="tablet-cheer-multi">
                x{streak}
                <small> seguidos</small>
              </b>
            )}
          </span>
        </div>
        <div
          className="goal-score"
          aria-label={`Madrid ${score.red}, Barça ${score.blue}`}
        >
          <span>MARCADOR</span>
          <div>
            <b className={team === "red" ? "scoring" : ""}>{score.red}</b>
            <i>–</i>
            <b className={team === "blue" ? "scoring" : ""}>{score.blue}</b>
          </div>
          <small>MADRID · BARÇA</small>
        </div>
      </div>
      <div className="goal-time" aria-hidden="true" />
    </div>
  );
}
