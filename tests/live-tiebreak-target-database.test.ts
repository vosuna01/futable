import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Migration 010: tie-break between losers by matches played today, and goals to win.
const db = new PGlite();
const id = (n: number) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  tablet = id(3),
  outsider = id(4);
const account = (n: number) => id(10 + n);
const player = (n: number) => id(20 + n);
interface Slot {
  id: string;
  waited: number;
}
interface State {
  round: number;
  target?: number;
  played: Record<string, number>;
  goals: { blue: number; red: number };
  court: {
    blue: { defender: Slot; forward: Slot };
    red: { defender: Slot; forward: Slot };
  } | null;
  queue: { id: string; since: number }[];
}
let k: { id: string; revision: number; state: State };
let operation = 100;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
const command = async (action: string, fields: Record<string, unknown> = {}) =>
  (
    await db.query<{ value: typeof k }>(
      "select public.live_session_command($1,$2,$3) value",
      [
        league,
        action,
        JSON.stringify({
          operation_id: id(operation++),
          season_id: season,
          session_id: k?.id,
          revision: k?.revision,
          ...fields,
        }),
      ],
    )
  ).rows[0].value;

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
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [tablet, outsider, ...[1, 2, 3, 4, 5].map(account)])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'010 QA')", [
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
}, 30000);
afterAll(async () => db.close());

describe.sequential("Migración 010: desempate y goles para ganar", () => {
  it("la 010 no se aplica sobre una RPC distinta de la 009", async () => {
    await db.exec("reset role");
    const sql = await readFile(
      new URL(
        "../supabase/migrations/010_live_tiebreak_target.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await expect(db.exec(sql)).rejects.toThrow(
      /no coincide con la migración 009/,
    );
    await db.exec("rollback");
  });

  it("fija a cuántos goles se juega y lo conserva entre partidas", async () => {
    await as(tablet);
    k = await command("join", { players: [1, 2, 3, 4].map(player) });
    expect(k.state.target).toBeUndefined();
    k = await command("start", {
      lineup: {
        blue: { defender: player(1), forward: player(2) },
        red: { defender: player(3), forward: player(4) },
      },
    });
    k = await command("target", { goals: 5 });
    expect(k.state.target).toBe(5);
    for (const goals of [0, 100, null])
      await expect(command("target", { goals })).rejects.toThrow(
        /Goles para ganar inválidos/,
      );
    k = await command("result", { winner: "blue" });
    expect(k.state.target).toBe(5);
  });

  it("solo lo cambia quien lleva la pista", async () => {
    await as(account(5));
    await expect(command("target", { goals: 3 })).rejects.toThrow(/Fíchate/);
    await as(outsider);
    await expect(command("target", { goals: 3 })).rejects.toThrow(/autorizado/);
    // A player on court may change it.
    await as(account(1));
    k = await command("target", { goals: 3 });
    expect(k.state.target).toBe(3);
  });

  it("con la misma espera, sale primero quien ha jugado menos hoy (sin sorteo)", async () => {
    // Red loses with the same wait, but its defender has played more today.
    await db.exec("reset role");
    const state = { ...k.state };
    state.queue = [];
    state.court!.red.defender = { id: player(3), waited: 1 };
    state.court!.red.forward = { id: player(4), waited: 1 };
    state.played = { ...state.played, [player(3)]: 4, [player(4)]: 1 };
    await db.query("update public.live_sessions set state=$1 where id=$2", [
      JSON.stringify(state),
      k.id,
    ]);
    await as(tablet);
    // Repeated with undo: a coin would fail this check about half the time.
    for (let round = 0; round < 6; round++) {
      k = await command("result", { winner: "blue" });
      // With an empty queue both losers return: the first out defends.
      expect(k.state.court!.red.defender.id).toBe(player(4));
      expect(k.state.court!.red.forward.id).toBe(player(3));
      k = await command("undo", {});
    }
  });

  it("la espera más larga sigue mandando sobre las partidas jugadas", async () => {
    await db.exec("reset role");
    const state = { ...k.state };
    state.court!.red.defender = { id: player(3), waited: 2 };
    state.court!.red.forward = { id: player(4), waited: 1 };
    state.played = { ...state.played, [player(3)]: 9, [player(4)]: 1 };
    await db.query("update public.live_sessions set state=$1 where id=$2", [
      JSON.stringify(state),
      k.id,
    ]);
    await as(tablet);
    k = await command("result", { winner: "blue" });
    expect(k.state.court!.red.defender.id).toBe(player(3));
  });
});
