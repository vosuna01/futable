import type { Match } from "./types";
export const participationDays = (matches: Match[], id: string) =>
  new Set(
    matches
      .filter(
        (m) =>
          m.status === "valid" &&
          m.participants.some((p) => p.player_id === id),
      )
      .map((m) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(m.played_at)),
      ),
  ).size;
