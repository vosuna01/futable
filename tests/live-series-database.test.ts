import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Migration 017: optional best-of series for four players, on top of every
// migration applied in production (coins and MMR triggers included).
const db = new PGlite();
const id = (n: number) =>
  `17000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  tablet = id(4);
const account = (n: number) => id(10 + n);
const player = (n: number) => id(20 + n);
interface Slot {
  id: string;
  waited: number;
}
interface Court {
  blue: { defender: Slot; forward: Slot };
  red: { defender: Slot; forward: Slot };
}
interface State {
  round: number;
  goals: { blue: number; red: number };
  goal_log?: { team: string; player: string | null }[];
  court: Court | null;
  queue: { id: string; since: number }[];
  series?: { best_of: number; wins: { blue: number; red: number } };
  last_series?: {
    best_of: number;
    wins: { blue: number; red: number };
    winner: string;
    court: Court;
  };
}
let k: {
  id: string;
  revision: number;
  status: string;
  state: State;
  last_match: string | null;
};
let operation = 100;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
const command = async (
  action: string,
  fields: Record<string, unknown> = {},
) => {
  const result = await db.query<{ value: typeof k }>(
    "select public.live_session_command($1,$2,$3) value",
    [
      league,
      action,
      JSON.stringify({
        operation_id: id(operation++),
        season_id: season,
        session_id: k?.status === "active" ? k.id : undefined,
        revision: k?.status === "active" ? k.revision : undefined,
        ...fields,
      }),
    ],
  );
  return result.rows[0].value;
};
const lineup = {
  blue: { defender: player(1), forward: player(2) },
  red: { defender: player(3), forward: player(4) },
};
const validMatches = async () => {
  await db.exec("reset role");
  const n = (
    await db.query<{ n: number }>(
      "select count(*)::int n from public.matches where status='valid'",
    )
  ).rows[0].n;
  await as(tablet);
  return n;
};
const goals = async (team: "blue" | "red", times: number) => {
  for (let i = 0; i < times; i++)
    k = await command("goal", {
      team,
      delta: 1,
      player: team === "blue" ? player(1) : player(3),
    });
};

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
    "015_bet_at_kickoff",
    "016_mmr_odds",
    "017_live_series",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [tablet, ...[1, 2, 3, 4, 5].map(account)])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'Serie QA')", [
    league,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  await db.query(
    "insert into public.league_memberships values($1,$2,'scoreboard',true)",
    [league, tablet],
  );
  for (const n of [1, 2, 3, 4, 5]) {
    await db.query(
      "insert into public.league_memberships values($1,$2,'player',true)",
      [league, account(n)],
    );
    await db.query(
      "insert into public.players(id,league_id,name,account_id) values($1,$2,$3,$4)",
      [player(n), league, `Jugador ${n}`, account(n)],
    );
  }
  await as(tablet);
}, 60000);
afterAll(async () => db.close());

describe.sequential("Migración 017: serie al mejor de N", () => {
  it("sin serie, la partida normal rota igual que antes", async () => {
    k = await command("join", { players: [1, 2, 3, 4, 5].map(player) });
    k = await command("start", { lineup });
    expect(k.state.series).toBeUndefined();
    await goals("blue", 3);
    k = await command("result", { winner: "blue" });
    // Losers leave and the next in the queue steps in, as always.
    expect(k.state.court?.blue.defender.id).toBe(player(1));
    expect(k.state.court?.red.defender.id).not.toBe(player(3));
    expect(k.state.series).toBeUndefined();
    expect(await validMatches()).toBe(1);
    k = await command("close");
  });

  it("rechaza series que no sean al mejor de 3, 5 o 7", async () => {
    k = await command("join", { players: [1, 2, 3, 4].map(player) });
    await expect(
      command("start", { lineup, series: { best_of: 4 } }),
    ).rejects.toThrow(/al mejor de 3, 5 o 7/);
  });

  it("al mejor de 3: los mismos cuatro siguen y cada partida cuenta", async () => {
    k = await command("start", { lineup, series: { best_of: 3 } });
    expect(k.state.series).toEqual({ best_of: 3, wins: { blue: 0, red: 0 } });
    const round = k.state.round;
    await goals("blue", 3);
    k = await command("result", { winner: "blue" });
    expect(k.state.series?.wins).toEqual({ blue: 1, red: 0 });
    expect(k.state.court).toEqual({
      blue: expect.objectContaining({
        defender: expect.objectContaining({ id: player(1) }),
      }),
      red: expect.objectContaining({
        defender: expect.objectContaining({ id: player(3) }),
      }),
    });
    expect(k.state.goals).toEqual({ blue: 0, red: 0 });
    expect(k.state.goal_log).toEqual([]);
    expect(k.state.round).toBe(round + 1);
    expect(await validMatches()).toBe(2);
    await goals("red", 3);
    k = await command("result", { winner: "red" });
    expect(k.state.series?.wins).toEqual({ blue: 1, red: 1 });
    expect(k.state.court).not.toBeNull();
  });

  it("deshacer devuelve la serie al marcador anterior", async () => {
    await goals("blue", 3);
    k = await command("result", { winner: "blue" });
    // The series is over: the four are back in the queue and the court is empty.
    expect(k.state.court).toBeNull();
    expect(k.state.series).toBeUndefined();
    expect(k.state.last_series).toMatchObject({
      best_of: 3,
      wins: { blue: 2, red: 1 },
      winner: "blue",
    });
    expect(k.state.queue.map((w) => w.id).sort()).toEqual(
      [1, 2, 3, 4].map(player).sort(),
    );
    expect(await validMatches()).toBe(4);
    k = await command("undo");
    expect(k.state.series?.wins).toEqual({ blue: 1, red: 1 });
    expect(k.state.court?.blue.defender.id).toBe(player(1));
    expect(k.state.goals).toEqual({ blue: 3, red: 0 });
    expect(await validMatches()).toBe(3);
  });

  it("al terminar la serie se puede empezar otra o una partida normal", async () => {
    k = await command("result", { winner: "blue" });
    expect(k.state.court).toBeNull();
    k = await command("start", { lineup });
    expect(k.state.series).toBeUndefined();
    expect(k.state.last_series).toBeUndefined();
  });
});
