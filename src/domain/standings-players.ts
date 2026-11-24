import type { Player } from "./types";

/** Cuentas de marcador (tablet/ESP32): juegan como cuenta, no como jugador. */
const SCOREBOARD_ACCOUNTS = new Set([
  "070c7c3b-131b-4c57-8b24-bc5d8308ae6b",
  "a3487dce-7833-4f38-8fae-30c21c610aa0",
]);

/**
 * Jugadores que aparecen en las clasificaciones: activos y que no son una
 * cuenta de marcador. Solo afecta a lo que se muestra, no a los cálculos.
 */
export const rankablePlayers = (players: Player[]) =>
  players.filter(
    (p) => p.active && !SCOREBOARD_ACCOUNTS.has(p.account_id ?? ""),
  );
