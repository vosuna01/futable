import { defaultRules, type Snapshot, type Participant } from "../domain/types";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function createDemo(): Snapshot {
  const league = { id: id(1), name: "Liga FutABLE" };
  const names = [
    "Álvaro Martín",
    "Dani Romero",
    "Pablo Sánchez",
    "Miguel Torres",
    "Javi López",
    "Carlos Ruiz",
    "Sergio Díaz",
    "Marcos Vega",
    "Víctor García",
    "Adrián Moreno",
    "Lucas Pérez",
    "Jorge Navarro",
    "Nacho Gil",
    "Raúl Molina",
  ];
  const players = names.map((name, i) => ({
    id: id(i + 10),
    league_id: league.id,
    name,
    avatar_url: null,
    active: true,
  }));
  const season = {
    ...defaultRules,
    id: id(2),
    league_id: league.id,
    name: "Temporada de otoño · 2026",
    starts_at: "2026-09-01",
    ends_at: "2026-11-27",
    status: "active" as const,
    final_results: null,
  };
  let seed = 142;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const matches = Array.from({ length: 126 }, (_, i) => {
    const available = players.slice(0, i < 118 ? 12 : 14);
    const picked: typeof players = [];
    while (picked.length < 4) {
      const p = available[Math.floor(random() * available.length)];
      if (!picked.includes(p)) picked.push(p);
    }
    const participants: Participant[] = picked.map((p, j) => ({
      player_id: p.id,
      team: j < 2 ? "blue" : "red",
      position: j % 2 === 0 ? "defender" : "forward",
    }));
    const blue = random() < (picked[0].id === players[0].id ? 0.8 : 0.55),
      score = Math.floor(random() * 5),
      date = new Date(
        Date.UTC(2026, 9, 1 + Math.floor(i / 5), 10, (i % 5) * 13),
      ).toISOString();
    return {
      id: id(1000 + i),
      league_id: league.id,
      season_id: season.id,
      blue_score: blue ? 5 : score,
      red_score: blue ? score : 5,
      winner: blue ? ("blue" as const) : ("red" as const),
      played_at: date,
      created_at: date,
      created_by: id(3),
      status: "valid" as const,
      operation_id: id(2000 + i),
      participants,
      revision: 1,
    };
  }).reverse();
  return {
    league,
    players,
    seasons: [season],
    matches,
    memberships: [
      {
        user_id: id(3),
        role: "admin",
        active: true,
        display_name: "Administrador demo",
      },
    ],
    audit: [],
    role: "admin",
  };
}
