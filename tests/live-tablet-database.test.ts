import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Migration 008: wall tablet account, goals per player and agreed posts in the queue.
const db = new PGlite();
const id = (n: number) =>
  `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  admin = id(3),
  tablet = id(4);
const account = (n: number) => id(10 + n);
const player = (n: number) => id(20 + n);
interface Slot {
  id: string;
  waited: number;
}
interface State {
  round: number;
  goals: { blue: number; red: number };
  goal_log?: { team: string; player: string | null }[];
  court: {
    blue: { defender: Slot; forward: Slot };
    red: { defender: Slot; forward: Slot };
  } | null;
  queue: { id: string; since: number; post?: string }[];
}
let k: {
  id: string;
  revision: number;
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
        session_id: k?.id,
        revision: k?.revision,
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
    // 010: the same suite must hold with the newer tie-break and target.
    "010_live_tiebreak_target",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [admin, tablet, ...[1, 2, 3, 4, 5, 6, 7].map(account)])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'Tablet QA')", [
    league,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  await db.query(
    "insert into public.league_memberships values($1,$2,'admin',true)",
    [league, admin],
  );
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
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

describe.sequential("Migración 008: tablet de pared", () => {
  it("solo un administrador da el rol de tablet, y no admite roles inventados", async () => {
    await as(account(1));
    await expect(
      db.query("select public.admin_command($1,'membership.save',$2)", [
        league,
        JSON.stringify({ user_id: tablet, role: "scoreboard", active: true }),
      ]),
    ).rejects.toThrow(/Solo administradores/);
    await as(admin);
    await expect(
      db.query("select public.admin_command($1,'membership.save',$2)", [
        league,
        JSON.stringify({ user_id: tablet, role: "kiosk", active: true }),
      ]),
    ).rejects.toThrow(/role_check/);
    await db.query("select public.admin_command($1,'membership.save',$2)", [
      league,
      JSON.stringify({
        user_id: tablet,
        role: "scoreboard",
        active: true,
        display_name: "Tablet",
      }),
    ]);
  });

  it("la tablet lleva la pista sin ficha de jugador ni permisos de admin", async () => {
    await as(tablet);
    // Opening the day by signing others up works for any member.
    k = await command("join", {
      players: [1, 2, 3, 4, 5].map(player),
    });
    expect(k.state.goal_log).toEqual([]);
    k = await command("start", { lineup });
    k = await command("assign", {
      team: "blue",
      defender: player(2),
      forward: player(1),
    });
    k = await command("assign", {
      team: "blue",
      defender: player(1),
      forward: player(2),
    });
    // It still cannot administer the league.
    await expect(
      db.query("select public.admin_command($1,'season.create',$2)", [
        league,
        JSON.stringify({ name: "Otra" }),
      ]),
    ).rejects.toThrow(/Solo administradores/);
    // Nor read the audit, which stays for administrators.
    expect(
      (await db.query("select * from public.audit_log")).rows,
    ).toHaveLength(0);
  });

  it("cuenta goles por jugador y quita el último del jugador o del equipo", async () => {
    k = await command("goal", { team: "blue", delta: 1, player: player(2) });
    k = await command("goal", { team: "blue", delta: 1, player: player(1) });
    k = await command("goal", { team: "blue", delta: 1, player: player(2) });
    // The scoreboard firmware sends goals without a player: still allowed.
    k = await command("goal", { team: "red", delta: 1 });
    expect(k.state.goals).toEqual({ blue: 3, red: 1 });
    await expect(
      command("goal", { team: "red", delta: 1, player: player(1) }),
    ).rejects.toThrow(/no está en ese equipo/);
    await expect(
      command("goal", { team: "blue", delta: -1, player: player(3) }),
    ).rejects.toThrow(/no está en ese equipo/);
    k = await command("goal", { team: "blue", delta: -1, player: player(1) });
    await expect(
      command("goal", { team: "blue", delta: -1, player: player(1) }),
    ).rejects.toThrow(/no tiene goles/);
    k = await command("goal", { team: "blue", delta: 1, player: player(1) });
    // A team-level take-back removes the latest goal of that team, whoever scored.
    k = await command("goal", { team: "blue", delta: -1 });
    expect(k.state.goals.blue).toBe(2);
    expect(k.state.goal_log).toEqual([
      { team: "blue", player: player(2) },
      { team: "blue", player: player(2) },
      { team: "red", player: null },
    ]);
  });

  it("un intercambio de puestos conserva los goles de cada jugador", async () => {
    k = await command("assign", {
      team: "blue",
      defender: player(2),
      forward: player(1),
    });
    expect(
      k.state.goal_log!.filter((g) => g.player === player(2)),
    ).toHaveLength(2);
  });

  it("acuerda puestos en la cola y la pareja que entra los respeta", async () => {
    // Five signed up: player 5 waits alone and pairs with a loser.
    k = await command("prefer", { player: player(5), post: "forward" });
    expect(k.state.queue[0]).toMatchObject({ id: player(5), post: "forward" });
    await expect(
      command("prefer", { player: player(5), post: "portero" }),
    ).rejects.toThrow(/Puesto inválido/);
    await expect(
      command("prefer", { player: player(1), post: "forward" }),
    ).rejects.toThrow(/no está esperando/);
    k = await command("result", { winner: "blue" });
    // Player 5 asked to attack, so the loser who comes back defends.
    expect(k.state.court!.red.forward.id).toBe(player(5));
    expect([player(3), player(4)]).toContain(k.state.court!.red.defender.id);
    expect(k.state.goal_log).toEqual([]);
    expect(k.state.goals).toEqual({ blue: 0, red: 0 });
  });

  it("guarda los goleadores con la partida, no los goles sin nombre", async () => {
    const scorers = await db.query<{
      player_id: string;
      goals: number;
      team: string;
    }>(
      "select player_id,goals,team from public.match_scorers where match_id=$1",
      [k.last_match],
    );
    expect(scorers.rows).toEqual([
      { player_id: player(2), goals: 2, team: "blue" },
    ]);
    const match = await db.query<{ blue_score: number; red_score: number }>(
      "select blue_score,red_score from public.matches where id=$1",
      [k.last_match],
    );
    expect(match.rows[0]).toEqual({ blue_score: 2, red_score: 1 });
  });

  it("deshacer devuelve el marcador con sus goleadores", async () => {
    k = await command("undo", {});
    expect(k.state.goals).toEqual({ blue: 2, red: 1 });
    expect(k.state.goal_log).toHaveLength(3);
    expect(k.state.queue[0]).toMatchObject({ id: player(5), post: "forward" });
  });

  it("quita y borra preferencias; un jugador sin fichar no las toca", async () => {
    k = await command("prefer", { player: player(5), post: null });
    expect(k.state.queue[0]).toEqual({ id: player(5), since: 0 });
    await as(account(6));
    await expect(
      command("prefer", { player: player(5), post: "defender" }),
    ).rejects.toThrow(/Fíchate/);
    await expect(command("goal", { team: "red", delta: 1 })).rejects.toThrow(
      /Fíchate/,
    );
    // The player waiting can agree their own post.
    await as(account(5));
    k = await command("prefer", { player: player(5), post: "defender" });
    expect(k.state.queue[0].post).toBe("defender");
  });

  it("una sesión anterior a la 008 sigue funcionando y reconstruye sus goles", async () => {
    await db.exec("reset role");
    await db.query(
      "update public.live_sessions set state=state-'goal_log' where id=$1",
      [k.id],
    );
    await as(tablet);
    k = await command("goal", { team: "red", delta: 1, player: player(4) });
    expect(k.state.goals).toEqual({ blue: 2, red: 2 });
    expect(k.state.goal_log).toEqual([
      { team: "blue", player: null },
      { team: "blue", player: null },
      { team: "red", player: null },
      { team: "red", player: player(4) },
    ]);
  });

  it("cierra quien abrió la sesión, aunque sea la tablet", async () => {
    // The tablet opened this one, so it may close it; an unrelated player may not.
    await as(account(7));
    await expect(command("close", {})).rejects.toThrow(/Solo quien abrió/);
    await as(tablet);
    k = await command("close", {});
    expect((k as unknown as { status: string }).status).toBe("closed");
  });
});
