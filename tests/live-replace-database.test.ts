import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { replacePair, type LiveSession } from "../src/domain/live";

const db = new PGlite();
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  tablet = id(3),
  outsider = id(4);
const player = (n: number) => id(20 + n);
let k: LiveSession;
let op = 100;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
function input(fields: Record<string, unknown> = {}) {
  return {
    season_id: season,
    session_id: k?.id,
    revision: k?.revision,
    operation_id: id(op++),
    expected_revision: k?.revision,
    ...fields,
  };
}
async function send(action: string, payload: Record<string, unknown>) {
  return (
    await db.query<{ value: LiveSession }>(
      "select public.live_session_command($1,$2,$3) value",
      [league, action, JSON.stringify(payload)],
    )
  ).rows[0].value;
}
const command = (action: string, fields: Record<string, unknown> = {}) =>
  send(action, input(fields));
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
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
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users(id) values($1),($2)", [
    tablet,
    outsider,
  ]);
  await db.query(
    "insert into public.leagues(id,name) values($1,'Replace QA')",
    [league],
  );
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  await db.query(
    "insert into public.league_memberships(league_id,user_id,role) values($1,$2,'scoreboard'),($1,$3,'player')",
    [league, tablet, outsider],
  );
  for (let n = 1; n <= 8; n++)
    await db.query(
      "insert into public.players(id,league_id,name,active) values($1,$2,$3,$4)",
      [player(n), league, `Jugador ${n}`, n !== 8],
    );
  await as(tablet);
  k = await command("join", { players: [1, 2, 3, 4, 5, 6].map(player) });
  k = await command("start", {
    lineup: {
      blue: { defender: player(1), forward: player(2) },
      red: { defender: player(3), forward: player(4) },
    },
  });
}, 30000);
afterAll(async () => db.close());

describe.sequential("Sustituir una pareja desde la tablet", () => {
  it("rechaza duplicados, rivales, jugadores inactivos y estados ya cambiados", async () => {
    for (const fields of [
      { defender: player(5), forward: player(5) },
      { defender: player(3), forward: player(5) },
      { defender: player(5), forward: player(8) },
      { defender: player(5), forward: id(999) },
      {
        defender: player(5),
        forward: player(6),
        expected_revision: k.revision - 1,
      },
    ])
      await expect(
        command("replace", { team: "blue", ...fields }),
      ).rejects.toThrow();
    expect(
      (
        await db.query<{ state: unknown }>(
          "select state from public.live_sessions where id=$1",
          [k.id],
        )
      ).rows[0].state,
    ).toEqual(k.state);
  });
  it("un miembro sin fichar no sustituye jugadores ni invoca el ayudante privado", async () => {
    await as(outsider);
    await expect(
      command("replace", {
        team: "blue",
        defender: player(5),
        forward: player(6),
      }),
    ).rejects.toThrow(/Fíchate/);
    await expect(
      db.query("select public.live_replace_pair_state($1,$2,$3,$4)", [
        JSON.stringify(k.state),
        "blue",
        player(5),
        player(6),
      ]),
    ).rejects.toThrow(/permission denied/);
    await as(tablet);
  });
  it("permite entrar a alguien sin fichar, conserva al compañero y devuelve al saliente a la cola", async () => {
    k = await command("goal", { team: "blue", player: player(1), delta: 2 });
    const before = k.state;
    k = await command("replace", {
      team: "blue",
      defender: player(7),
      forward: player(2),
    });
    expect(k.state).toEqual(replacePair(before, "blue", player(7), player(2)));
    expect(k.state.court!.red).toEqual(before.court!.red);
    expect(k.state.queue.map((p) => p.id)).toEqual([
      player(5),
      player(6),
      player(1),
    ]);
    expect(k.state.goals).toEqual({ blue: 0, red: 0 });
    expect(k.state.goal_log).toEqual([]);
    expect(k.last_match).toBeNull();
    expect((await db.query("select * from public.matches")).rows).toHaveLength(
      0,
    );
  });
  it("sustituye a ambos por gente de la cola, no duplica al reintentar y registra la auditoría", async () => {
    const before = k.state;
    const payload = input({
      team: "blue",
      defender: player(5),
      forward: player(6),
    });
    k = await send("replace", payload);
    expect(k.state).toEqual(replacePair(before, "blue", player(5), player(6)));
    expect(k.state.queue.map((p) => p.id)).toEqual([
      player(1),
      player(7),
      player(2),
    ]);
    expect(await send("replace", payload)).toEqual(k);
    await expect(
      send("replace", { ...payload, forward: player(1) }),
    ).rejects.toThrow(/reutilizada/);
    await expect(command("undo")).rejects.toThrow(/No hay resultado/);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select * from public.audit_log where action='live.replace' and after_data->>'id'=$1",
          [k.id],
        )
      ).rows,
    ).toHaveLength(2);
    await as(tablet);
  });
  it("un intercambio mantiene los goles y el siguiente resultado usa la pareja nueva", async () => {
    k = await command("goal", { team: "blue", player: player(5), delta: 1 });
    k = await command("assign", {
      team: "blue",
      defender: player(6),
      forward: player(5),
    });
    expect(k.state.goals.blue).toBe(1);
    expect(k.state.goal_log).toEqual([{ team: "blue", player: player(5) }]);
    k = await command("result", { winner: "blue" });
    const saved = await db.query<{ player_id: string }>(
      "select player_id from public.match_participants where match_id=$1",
      [k.last_match],
    );
    expect(saved.rows.map((p) => p.player_id).sort()).toEqual(
      [3, 4, 5, 6].map(player).sort(),
    );
    expect((await db.query("select * from public.matches")).rows).toHaveLength(
      1,
    );
  });
});
