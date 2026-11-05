import type { MatchInput, Player, Season } from "./types";
export function validateMatch(
  input: MatchInput,
  season: Season | undefined,
  players: Player[],
): string | null {
  if (!season || season.status !== "active" || input.season_id !== season.id)
    return "Selecciona una temporada activa.";
  if (
    input.participants.length !== 4 ||
    new Set(input.participants.map((p) => p.player_id)).size !== 4
  )
    return "Selecciona cuatro jugadores diferentes.";
  if (
    input.participants.some(
      (p) =>
        !players.some(
          (x) =>
            x.id === p.player_id &&
            x.active &&
            x.league_id === season.league_id,
        ),
    )
  )
    return "Los cuatro jugadores deben estar activos en esta liga.";
  for (const team of ["blue", "red"]) {
    const ps = input.participants.filter((p) => p.team === team);
    if (
      ps.length !== 2 ||
      ps.filter((p) => p.position === "defender").length !== 1 ||
      ps.filter((p) => p.position === "forward").length !== 1
    )
      return "Cada equipo necesita una defensa y un delantero.";
  }
  const { blue_score: a, red_score: b } = input;
  if (a === null && b === null)
    return input.winner === "blue" || input.winner === "red"
      ? null
      : "Indica quién ganó.";
  if (
    a === null ||
    b === null ||
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0 ||
    a === b ||
    a > 99 ||
    b > 99
  )
    return "El ganador debe tener más goles: usa enteros entre 0 y 99, sin empate.";
  return null;
}
