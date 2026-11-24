/**
 * MMR (Elo) en modo prueba. Se calcula en el cliente a partir del historial,
 * igual que V/PJ: no hay tablas ni contadores en la base de datos. Nada de
 * este módulo altera el ranking actual.
 */
import { ranking } from "./rankings";
import type { Match, Player, Team } from "./types";

/**
 * Activado por defecto en desarrollo (`pnpm dev`) y desactivado en la web
 * publicada. `VITE_MMR_ENABLED=true|false` lo fuerza en cualquier entorno.
 */
const flag = import.meta.env.VITE_MMR_ENABLED as string | undefined;
export const MMR_ENABLED = flag
  ? flag === "true"
  : Boolean(import.meta.env.DEV);

export const MMR_START = 1000;
export const K_NEW = 40;
export const K_SETTLED = 24;
/** Partidas con K alto antes de pasar a K_SETTLED. */
export const K_NEW_GAMES = 10;
/** Por debajo de estas partidas, el modo B siembra en MMR_START. */
export const SEED_MIN_GAMES = 10;

export type MmrSource = "history" | "winrate";
export interface PlayerMmr {
  player_id: string;
  mmr: number;
  mmr_source: MmrSource;
  partidos_contados: number;
}
export interface MmrHistoryRow {
  match_id: string;
  player_id: string;
  mmr_antes: number;
  delta: number;
  mmr_despues: number;
}
export interface MmrState {
  player_mmr: Record<string, PlayerMmr>;
  mmr_history: MmrHistoryRow[];
  mode: "A" | "B";
  reason: string;
}

/** Probabilidad de que gane un equipo de nivel `ra` frente a uno de nivel `rb`. */
export const expected = (ra: number, rb: number) =>
  1 / (1 + 10 ** ((rb - ra) / 400));

export const kFactor = (gamesBefore: number) =>
  gamesBefore < K_NEW_GAMES ? K_NEW : K_SETTLED;

/** MMR inicial del modo B a partir del winrate actual. */
export function seedFromWinrate(wins: number, games: number): number {
  if (games < SEED_MIN_GAMES) return MMR_START;
  const p = Math.min(0.95, Math.max(0.05, wins / games));
  return MMR_START + 800 * Math.log10(p / (1 - p));
}

/** Orden cronológico del cálculo: fecha y, si coincide, id de la partida. */
export const chronological = (a: Match, b: Match) =>
  a.played_at.localeCompare(b.played_at) || a.id.localeCompare(b.id);

const teamOf = (m: Match, team: Team) =>
  m.participants.filter((p) => p.team === team).map((p) => p.player_id);

function assertProcessable(m: Match) {
  if (m.winner !== "blue" && m.winner !== "red")
    throw new Error(
      `La partida ${m.id} no tiene ganador; no se puede calcular el MMR.`,
    );
  const blue = teamOf(m, "blue"),
    red = teamOf(m, "red");
  if (
    !blue.length ||
    !red.length ||
    new Set([...blue, ...red]).size !== blue.length + red.length
  )
    throw new Error(`La partida ${m.id} no tiene dos equipos válidos.`);
}

const newPlayer = (id: string, source: MmrSource): PlayerMmr => ({
  player_id: id,
  mmr: MMR_START,
  mmr_source: source,
  partidos_contados: 0,
});

/**
 * Aplica una partida al estado y devuelve las filas de historial generadas.
 * Es la única función de cálculo: la usan el recálculo completo y el alta
 * incremental de una partida nueva. Las partidas anuladas no se procesan.
 */
export function applyMatch(state: MmrState, m: Match): MmrHistoryRow[] {
  if (m.status !== "valid") return [];
  assertProcessable(m);
  const source: MmrSource = state.mode === "A" ? "history" : "winrate";
  const get = (id: string) => (state.player_mmr[id] ??= newPlayer(id, source));
  const level = (team: Team) => {
    const ids = teamOf(m, team);
    return ids.reduce((sum, id) => sum + get(id).mmr, 0) / ids.length;
  };
  const eBlue = expected(level("blue"), level("red"));
  // Calcular todos los Δ antes de modificar ningún MMR.
  const rows = m.participants.map((p) => {
    const player = get(p.player_id);
    const e = p.team === "blue" ? eBlue : 1 - eBlue;
    const s = p.team === m.winner ? 1 : 0;
    const delta = kFactor(player.partidos_contados) * (s - e);
    return {
      match_id: m.id,
      player_id: p.player_id,
      mmr_antes: player.mmr,
      delta,
      mmr_despues: player.mmr + delta,
    };
  });
  for (const row of rows) {
    const player = state.player_mmr[row.player_id];
    player.mmr = row.mmr_despues;
    player.partidos_contados++;
  }
  state.mmr_history.push(...rows);
  return rows;
}

/**
 * El historial es coherente si, para cada jugador, las partidas válidas que
 * se van a recalcular dan exactamente su V/PJ del ranking actual.
 */
export function checkHistory(
  players: Player[],
  matches: Match[],
): { ok: true; games: number } | { ok: false; reason: string } {
  const valid = matches.filter((m) => m.status === "valid");
  if (!valid.length)
    return { ok: false, reason: "no hay partidas válidas en el historial" };
  for (const m of valid) {
    try {
      assertProcessable(m);
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  }
  const counted = new Map<string, { games: number; wins: number }>();
  for (const m of valid)
    for (const p of m.participants) {
      const c = counted.get(p.player_id) ?? { games: 0, wins: 0 };
      c.games++;
      if (p.team === m.winner) c.wins++;
      counted.set(p.player_id, c);
    }
  for (const s of ranking(players, matches)) {
    const c = counted.get(s.player.id) ?? { games: 0, wins: 0 };
    if (c.games !== s.games || c.wins !== s.wins)
      return {
        ok: false,
        reason: `${s.player.name}: historial ${c.wins}/${c.games} frente a V/PJ ${s.wins}/${s.games}`,
      };
  }
  return { ok: true, games: valid.length };
}

/**
 * Borra solo los datos MMR y repite el arranque inicial. Es pura: con las
 * mismas entradas devuelve siempre el mismo resultado.
 *
 * Modo B: `seededAt` marca el momento de la siembra; las partidas hasta esa
 * fecha forman el V/PJ inicial y solo las posteriores mueven el MMR. Sin
 * `seededAt` se siembra con todo el historial disponible.
 */
export function recalculateMMR(
  players: Player[],
  matches: Match[],
  options: { forceMode?: "A" | "B"; seededAt?: string } = {},
): MmrState {
  const check = checkHistory(players, matches);
  const mode = options.forceMode ?? (check.ok ? "A" : "B");
  const reason = options.forceMode
    ? `modo ${mode} forzado`
    : check.ok
      ? `historial completo y coherente con V/PJ (${check.games} partidas)`
      : `historial no utilizable: ${check.reason}`;
  const state: MmrState = { player_mmr: {}, mmr_history: [], mode, reason };
  const ordered = matches
    .filter((m) => m.status === "valid")
    .sort(chronological);
  if (mode === "A") {
    for (const p of players)
      state.player_mmr[p.id] = newPlayer(p.id, "history");
    for (const m of ordered) applyMatch(state, m);
    return state;
  }
  const cut = options.seededAt;
  const prior = cut ? ordered.filter((m) => m.played_at <= cut) : ordered;
  const after = cut ? ordered.filter((m) => m.played_at > cut) : [];
  for (const s of ranking(players, prior))
    state.player_mmr[s.player.id] = {
      player_id: s.player.id,
      mmr: seedFromWinrate(s.wins, s.games),
      mmr_source: "winrate",
      // Los PJ previos cuentan para K: con 10 o más ya se usa K_SETTLED.
      partidos_contados: s.games,
    };
  for (const m of after) applyMatch(state, m);
  return state;
}

/** Δ de MMR de cada jugador en una partida, si se ha procesado. */
export function matchDeltas(state: MmrState, matchId: string) {
  return new Map(
    state.mmr_history
      .filter((r) => r.match_id === matchId)
      .map((r) => [r.player_id, r.delta]),
  );
}

export const formatMmr = (mmr: number) => String(Math.round(mmr));
export const formatDelta = (delta: number) => {
  const n = Math.round(delta);
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0";
};

export interface TeamPreview {
  /** Δ de cada jugador si gana su equipo. */
  win: number[];
  /** Δ de cada jugador si pierde su equipo. */
  lose: number[];
}
/**
 * Lo que ganaría o perdería cada equipo en una partida aún sin jugar. Usa
 * `applyMatch` sobre una copia de los cuatro jugadores: mismo cálculo, y el
 * estado original no se toca.
 */
export function previewMatch(
  state: MmrState,
  teams: Record<Team, string[]>,
): Record<Team, TeamPreview> {
  const at = new Date(0).toISOString();
  const simulate = (winner: Team) => {
    const copy: MmrState = { ...state, player_mmr: {}, mmr_history: [] };
    for (const id of [...teams.blue, ...teams.red])
      if (state.player_mmr[id])
        copy.player_mmr[id] = { ...state.player_mmr[id] };
    const rows = applyMatch(copy, {
      id: "preview",
      league_id: "",
      season_id: "",
      blue_score: null,
      red_score: null,
      winner,
      played_at: at,
      created_at: at,
      created_by: "",
      status: "valid",
      operation_id: "preview",
      revision: 0,
      participants: (["blue", "red"] as const).flatMap((team) =>
        teams[team].map((player_id, i) => ({
          player_id,
          team,
          position: i === 0 ? ("defender" as const) : ("forward" as const),
        })),
      ),
    });
    const of = (team: Team) =>
      rows.filter((r) => teams[team].includes(r.player_id)).map((r) => r.delta);
    return { blue: of("blue"), red: of("red") };
  };
  const blueWins = simulate("blue"),
    redWins = simulate("red");
  return {
    blue: { win: blueWins.blue, lose: redWins.blue },
    red: { win: redWins.red, lose: blueWins.red },
  };
}

/** «+12» o, si los K del equipo difieren, «+12/+20». */
export function formatTeamDelta(deltas: number[]) {
  const values = [...new Set(deltas.map((d) => formatDelta(d)))];
  return values.length ? values.join("/") : "±0";
}

let lastLogged = "";
/** Deja en consola qué modo se ha usado y por qué, una vez por cambio. */
export function logMmrMode(state: MmrState) {
  const line = `[MMR beta] Modo ${state.mode}: ${state.reason}`;
  if (line === lastLogged) return;
  lastLogged = line;
  console.info(line);
}
