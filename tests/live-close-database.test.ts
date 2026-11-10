import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Migration 011: any active member of the league may close the live session.
const db = new PGlite();
const id = (n: number) =>
  `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
    "011_live_close_any_member",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [tablet, outsider, ...[1, 2, 3, 4, 5].map(account)])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'011 QA')", [
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

describe.sequential("Migración 011: cualquier miembro cierra la sesión", () => {
  it("la 011 no se aplica sobre una RPC distinta de la 010", async () => {
    await db.exec("reset role");
    const sql = await readFile(
      new URL(
        "../supabase/migrations/011_live_close_any_member.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await expect(db.exec(sql)).rejects.toThrow(
      /no coincide con la migración 010/,
    );
    await db.exec("rollback");
  });

  it("un jugador que no abrió la sesión ni está fichado puede cerrarla", async () => {
    await as(account(1));
    k = await command("join", { players: [player(1), player(2)] });
    await as(account(5));
    const closed = (await command("close", {})) as unknown as {
      status: string;
    };
    expect(closed.status).toBe("closed");
    const open = await db.query<{ n: number }>(
      "select count(*)::int n from public.live_sessions where status='active'",
    );
    expect(open.rows[0].n).toBe(0);
  });

  it("la tablet también puede cerrarla, y quien no es de la liga no", async () => {
    await as(account(2));
    k = undefined as never;
    k = await command("join", { players: [player(2)] });
    await as(outsider);
    await expect(command("close", {})).rejects.toThrow(/autorizado/);
    await as(tablet);
    const closed = (await command("close", {})) as unknown as {
      status: string;
    };
    expect(closed.status).toBe("closed");
  });

  it("cerrar no borra las partidas guardadas", async () => {
    await as(account(3));
    k = undefined as never;
    k = await command("join", { players: [1, 2, 3, 4].map(player) });
    k = await command("start", {
      lineup: {
        blue: { defender: player(1), forward: player(2) },
        red: { defender: player(3), forward: player(4) },
      },
    });
    k = await command("result", { winner: "red" });
    await as(account(5));
    await command("close", {});
    await db.exec("reset role");
    const saved = await db.query<{ n: number }>(
      "select count(*)::int n from public.matches where status='valid'",
    );
    expect(saved.rows[0].n).toBe(1);
  });
});
