import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Migration 014: league_snapshot lists the credited scorers of every match.
const db = new PGlite();
const id = (n: number) =>
  `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  member = id(3),
  outsider = id(4),
  match = id(5),
  plain = id(6);
const player = (n: number) => id(20 + n);
const sql = (file: string) =>
  readFile(
    new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
    "utf8",
  );
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
interface Snapshot {
  matches: { id: string; scorers: { player_id: string; goals: number }[] }[];
}

beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const file of [
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
  ])
    await db.exec(await sql(file));
  await db.query("insert into auth.users(id) values($1),($2)", [
    member,
    outsider,
  ]);
  await db.query("insert into public.leagues(id,name) values($1,'014 QA')", [
    league,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  await db.query(
    "insert into public.league_memberships values($1,$2,'player',true)",
    [league, member],
  );
  for (const n of [1, 2, 3, 4])
    await db.query(
      "insert into public.players(id,league_id,name) values($1,$2,$3)",
      [player(n), league, `Jugador ${n}`],
    );
  // One live match with credited scorers and one manual match without them.
  for (const [mid, op] of [
    [match, id(7)],
    [plain, id(8)],
  ]) {
    await db.query(
      "insert into public.matches(id,league_id,season_id,blue_score,red_score,winner,created_by,operation_id) values($1,$2,$3,3,1,'blue',$4,$5)",
      [mid, league, season, member, op],
    );
    for (const [n, team, position] of [
      [1, "blue", "defender"],
      [2, "blue", "forward"],
      [3, "red", "defender"],
      [4, "red", "forward"],
    ] as const)
      await db.query(
        "insert into public.match_participants values($1,$2,$3,$4,$5)",
        [mid, league, player(n), team, position],
      );
  }
  await db.query(
    "insert into public.match_scorers values($1,$2,$3,'blue',2),($1,$2,$4,'red',1)",
    [match, league, player(2), player(3)],
  );
}, 30000);
afterAll(async () => db.close());

describe.sequential("Migración 014: goleadores en el snapshot", () => {
  it("cada partida trae sus goleadores; sin goleadores, una lista vacía", async () => {
    await as(member);
    const snap = (
      await db.query<{ s: Snapshot }>("select public.league_snapshot($1) s", [
        league,
      ])
    ).rows[0].s;
    const live = snap.matches.find((m) => m.id === match)!;
    expect(live.scorers).toEqual(
      expect.arrayContaining([
        { player_id: player(2), goals: 2 },
        { player_id: player(3), goals: 1 },
      ]),
    );
    expect(live.scorers).toHaveLength(2);
    expect(snap.matches.find((m) => m.id === plain)!.scorers).toEqual([]);
  });

  it("sigue cerrado a quien no es de la liga", async () => {
    await as(outsider);
    await expect(
      db.query("select public.league_snapshot($1)", [league]),
    ).rejects.toThrow(/autorizado/);
  });

  it("no se aplica dos veces ni sobre otra versión del snapshot", async () => {
    await db.exec("reset role");
    await expect(db.exec(await sql("014_snapshot_scorers"))).rejects.toThrow(
      /no coincide con la de la migración 001/,
    );
    await db.exec("rollback");
  });
});
