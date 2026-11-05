import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  owner = id(3),
  admin = id(4),
  other = id(5),
  outsider = id(6);
const pair = (n: number) => ({
  id: id(n),
  defender: id(n + 1),
  forward: id(n + 2),
});
const court = { blue: pair(10), red: pair(20), queue: [pair(30), pair(40)] };
let k: {
  id: string;
  revision: number;
  state: typeof court;
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
  op = id(operation++),
) => {
  const input = {
    operation_id: op,
    season_id: season,
    session_id: k?.id,
    revision: k?.revision,
    ...fields,
  };
  const result = await db.query<{ value: typeof k }>(
    "select public.king_session_command($1,$2,$3) value",
    [league, action, JSON.stringify(input)],
  );
  return result.rows[0].value;
};
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const file of ["001_league", "003_variable_goals", "005_king_sessions"])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [owner, admin, other, outsider])
    await db.query("insert into auth.users values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'King QA')", [
    league,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  for (const [user, role] of [
    [owner, "player"],
    [admin, "admin"],
    [other, "player"],
  ])
    await db.query(
      "insert into public.league_memberships values($1,$2,$3,true)",
      [league, user, role],
    );
  for (const p of [court.blue, court.red, ...court.queue])
    for (const player of [p.defender, p.forward])
      await db.query(
        "insert into public.players(id,league_id,name) values($1,$2,$3)",
        [player, league, player],
      );
}, 30000);
afterAll(async () => db.close());
describe.sequential("Sesiones compartidas: RPC atómica y permisos", () => {
  it("solo miembros leen, nadie escribe tablas directamente", async () => {
    await as(outsider);
    await expect(command("start", { state: court })).rejects.toThrow(
      /autorizado/,
    );
    await as(owner);
    await expect(
      db.query("insert into public.king_sessions(league_id) values($1)", [
        league,
      ]),
    ).rejects.toThrow(/permission/);
    k = await command("start", { state: court });
    expect(k.revision).toBe(1);
    await expect(command("start", { state: court })).rejects.toThrow(/abierta/);
    await as(outsider);
    expect(
      (await db.query("select * from public.king_sessions")).rows,
    ).toHaveLength(0);
    await as(other);
    expect(
      (await db.query("select * from public.king_sessions")).rows,
    ).toHaveLength(1);
    await expect(command("result", { winner: "blue" })).rejects.toThrow(/Solo/);
  });
  it("guarda ganador sin inventar goles, mantiene posiciones y rota cola", async () => {
    await as(owner);
    k = await command("result", { winner: "blue" });
    expect(k.state).toEqual({
      blue: court.blue,
      red: court.queue[0],
      queue: [court.queue[1], court.red],
    });
    const match = (
      await db.query<{
        blue_score: number | null;
        red_score: number | null;
        winner: string;
      }>("select * from public.matches where id=$1", [k.last_match])
    ).rows[0];
    expect(match.blue_score).toBeNull();
    expect(match.red_score).toBeNull();
    expect(match.winner).toBe("blue");
    expect(
      (
        await db.query(
          "select * from public.match_participants where match_id=$1",
          [k.last_match],
        )
      ).rows,
    ).toHaveLength(4);
  });
  it("deshacer restaura cola y anula sin borrar historial", async () => {
    const match = k.last_match;
    k = await command("undo");
    expect(k.state).toEqual(court);
    expect(k.last_match).toBeNull();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.matches where id=$1",
          [match],
        )
      ).rows[0].status,
    ).toBe("void");
    await expect(command("undo")).rejects.toThrow(/No hay/);
  });
  it("reintentar una operación no duplica y revisiones antiguas no avanzan otra vez", async () => {
    const op = id(operation++),
      rev = k.revision;
    const one = await command(
      "result",
      { winner: "red", blue_score: 1, red_score: 2 },
      op,
    );
    const two = await command(
      "result",
      { winner: "red", blue_score: 1, red_score: 2 },
      op,
    );
    expect(one.last_match).toBe(two.last_match);
    await expect(
      command("result", { winner: "blue", revision: rev }),
    ).rejects.toThrow(/cambiado/);
    k = two;
    expect(k.state.blue).toEqual(court.queue[0]);
    expect(k.state.red).toEqual(court.red);
  });
  it("rechaza ganador distinto del marcador y jugadores repetidos, sin guardar a medias", async () => {
    const revision = k.revision;
    await expect(
      command("result", { winner: "red", blue_score: 3, red_score: 1 }),
    ).rejects.toThrow(/coinciden/);
    await expect(
      command("result", { winner: "blue", blue_score: 3, red_score: null }),
    ).rejects.toThrow(/Marcador/);
    await expect(
      command("configure", { state: { ...court, queue: [court.blue] } }),
    ).rejects.toThrow(/repetida/);
    expect(
      (
        await db.query<{ revision: number }>(
          "select revision from public.king_sessions",
        )
      ).rows[0].revision,
    ).toBe(revision);
  });
  it("un admin puede organizar y dos parejas no generan revancha", async () => {
    await as(admin);
    k = await command("configure", { state: { ...court, queue: [] } });
    await expect(command("undo")).rejects.toThrow(/No hay/);
    k = await command("result", { winner: "red" });
    expect(k.state.blue).toBeNull();
    expect(k.state.queue).toEqual([court.blue]);
    await expect(command("result", { winner: "red" })).rejects.toThrow(
      /rivales/,
    );
  });
  it("no deshace una partida ya corregida por administración", async () => {
    await db.query("select public.admin_command($1,'match.void',$2)", [
      league,
      JSON.stringify({
        id: k.last_match,
        revision: 1,
        reason: "Prueba de anulación",
      }),
    ]);
    await expect(command("undo")).rejects.toThrow(/corregido o anulado/);
  });
  it("rechaza jugadores inactivos y temporadas cerradas", async () => {
    await db.exec("reset role");
    await db.query("update public.players set active=false where id=$1", [
      court.blue.defender,
    ]);
    await as(owner);
    await expect(command("configure", { state: court })).rejects.toThrow(
      /inactivo/,
    );
    await as(admin);
    await db.query("select public.admin_command($1,'season.close',$2)", [
      league,
      JSON.stringify({ id: season }),
    ]);
    await expect(command("result", { winner: "blue" })).rejects.toThrow(
      /inactiva/,
    );
  });
});
