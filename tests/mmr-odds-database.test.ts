import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { recalculateMMR } from "../src/domain/mmr";
import { mmrForecast } from "../src/domain/mmr-odds";
import type { LiveState } from "../src/domain/live";
import type { Match, Player, Team } from "../src/domain/types";

/**
 * La migración 016 debe dar exactamente el mismo MMR y las mismas cuotas que
 * el cliente (src/domain/mmr.ts y mmr-odds.ts) con el mismo historial.
 */
const db = new PGlite();
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season1 = id(2),
  season2 = id(3),
  user = id(4),
  empty = id(5),
  emptySeason = id(6),
  p = (n: number) => id(100 + n);
const players: Player[] = Array.from({ length: 8 }, (_, i) => ({
  id: p(i),
  league_id: league,
  name: `J${i}`,
  active: true,
  avatar_url: null,
}));
const matches: Match[] = [];

/** Generador determinista para que el test sea reproducible. */
let seed = 20261124;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick4 = () => {
  const ids = players.map((x) => x.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 4);
};
const sig = (red: string[], blue: string[]) => ({ red, blue, target: 3 });
const court = (red: string[], blue: string[]) =>
  ({
    round: 1,
    court: {
      red: { defender: { id: red[0] }, forward: { id: red[1] } },
      blue: { defender: { id: blue[0] }, forward: { id: blue[1] } },
    },
    goals: { red: 0, blue: 0 },
    played: {},
    queue: [],
  }) as unknown as LiveState;
const sqlOdds = async (s: string, red: string[], blue: string[]) =>
  (
    await db.query<{ v: { red: number; blue: number } }>(
      "select public._coin_odds($1,$2) v",
      [s, JSON.stringify(sig(red, blue))],
    )
  ).rows[0].v;

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const f of [
    "001_league",
    "002_self_registration",
    "003_variable_goals",
    "004_self_profile",
    "005_king_sessions",
    "006_live_sessions",
    "007_live_queue_guards",
    "008_live_tablet",
    "009_live_replace_pair",
    "010_live_tiebreak_target",
    "011_live_close_any_member",
    "012_coins_honours",
    "013_fixed_odds",
    "014_snapshot_scorers",
    "015_bet_at_kickoff",
    "016_mmr_odds",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${f}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query(
    "insert into public.leagues(id,name) values($1,'MMR QA'),($2,'Vacía')",
    [league, empty],
  );
  await db.query(
    "insert into public.seasons(id,league_id,name,status) values($1,$3,'T1','closed'),($2,$3,'T2','active'),($4,$5,'V','active')",
    [season1, season2, league, emptySeason, empty],
  );
  for (const x of players)
    await db.query(
      "insert into public.players(id,league_id,name) values($1,$2,$3)",
      [x.id, league, x.name],
    );
  // 80 partidas en dos temporadas, con empates de hora y alguna anulada.
  for (let i = 0; i < 80; i++) {
    const four = pick4();
    const blueWins = rand() < 0.5;
    const minute = i % 7 === 0 ? i - 1 : i; // algunas a la misma hora
    const at = new Date(Date.UTC(2026, 10, 2, 9, minute)).toISOString();
    const m: Match = {
      id: id(1000 + Math.floor(rand() * 9000) * 10 + (i % 10)),
      league_id: league,
      season_id: i < 40 ? season1 : season2,
      blue_score: blueWins ? 3 : 1,
      red_score: blueWins ? 1 : 3,
      winner: blueWins ? "blue" : "red",
      status: i % 13 === 5 ? "void" : "valid",
      played_at: at,
      created_at: at,
      created_by: user,
      operation_id: id(200000 + i),
      revision: 1,
      participants: four.map((player_id, j) => ({
        player_id,
        team: (j < 2 ? "blue" : "red") as Team,
        position: j % 2 === 0 ? "defender" : "forward",
      })),
    };
    matches.push(m);
    await db.query(
      "insert into public.matches(id,league_id,season_id,blue_score,red_score,status,played_at,created_at,created_by,operation_id,winner) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        m.id,
        league,
        m.season_id,
        m.blue_score,
        m.red_score,
        m.status,
        m.played_at,
        m.created_at,
        user,
        m.operation_id,
        m.winner,
      ],
    );
    for (const x of m.participants)
      await db.query(
        "insert into public.match_participants(match_id,league_id,player_id,team,position) values($1,$2,$3,$4,$5)",
        [m.id, league, x.player_id, x.team, x.position],
      );
  }
}, 60000);
afterAll(() => db.close());

describe("Migración 016: cuotas según el MMR", () => {
  it("el MMR del servidor coincide con el de la app, con todas las temporadas", async () => {
    const server = (
      await db.query<{ player_id: string; mmr: number; games: number }>(
        "select * from public._mmr_ratings($1)",
        [league],
      )
    ).rows;
    const client = recalculateMMR(players, matches);
    expect(client.mode).toBe("A");
    expect(server).toHaveLength(players.length);
    for (const r of server) {
      expect(r.mmr).toBeCloseTo(client.player_mmr[r.player_id].mmr, 9);
      expect(r.games).toBe(client.player_mmr[r.player_id].partidos_contados);
    }
  });
  it("las cuotas del servidor son las mismas que muestra la app", async () => {
    for (let i = 0; i < 25; i++) {
      const four = pick4();
      const red = four.slice(0, 2),
        blue = four.slice(2);
      const f = mmrForecast(court(red, blue), players, matches)!;
      expect(await sqlOdds(season2, red, blue)).toEqual({
        red: f.red.decimal,
        blue: f.blue.decimal,
      });
    }
  });
  it("sin historial las dos cuotas son 1,85", async () => {
    expect(await sqlOdds(emptySeason, [p(0), p(1)], [p(2), p(3)])).toEqual({
      red: 1.85,
      blue: 1.85,
    });
  });
  it("el mercado nuevo se precia con el MMR mediante el trigger de la 013", async () => {
    const session = (
      await db.query<{ id: string }>(
        "insert into public.live_sessions(league_id,season_id,owner_id,state) values($1,$2,$3,$4) returning id",
        [
          league,
          season2,
          user,
          JSON.stringify({
            round: 1,
            court: null,
            goals: { red: 0, blue: 0 },
            played: {},
            queue: [],
          }),
        ],
      )
    ).rows[0].id;
    const red = [p(0), p(1)],
      blue = [p(2), p(3)];
    const market = (
      await db.query<{ odds: { red: number; blue: number } }>(
        "insert into public.coin_markets(league_id,season_id,session_id,round,signature,status) values($1,$2,$3,1,$4,'open') returning odds",
        [league, season2, session, JSON.stringify(sig(red, blue))],
      )
    ).rows[0];
    expect(market.odds).toEqual(await sqlOdds(season2, red, blue));
  });
  it("conserva el modelo anterior para poder volver atrás", async () => {
    const old = (
      await db.query<{ v: { red: number; blue: number } }>(
        "select public._coin_odds_winrate($1,$2) v",
        [season2, JSON.stringify(sig([p(0), p(1)], [p(2), p(3)]))],
      )
    ).rows[0].v;
    expect(old.red).toBeGreaterThanOrEqual(1.01);
    expect(old.blue).toBeGreaterThanOrEqual(1.01);
  });
  it("los clientes no pueden llamar a las funciones internas", async () => {
    await db.exec("set role authenticated");
    await expect(
      db.query("select * from public._mmr_ratings($1)", [league]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
