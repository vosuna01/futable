import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const ids = {
  league: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  player: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
  season: "10000000-0000-4000-8000-000000000005",
};
const uuid = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const participants = Array.from({ length: 4 }, (_, i) => ({
  player_id: uuid(i),
  team: i < 2 ? "blue" : "red",
  position: i % 2 ? "forward" : "defender",
}));
const input = (n: number) => ({
  operation_id: uuid(100 + n),
  season_id: ids.season,
  blue_score: 5,
  red_score: 2,
  participants,
});
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
const save = (n: number, changes: Record<string, unknown> = {}) =>
  db.query<{ id: string }>("select public.save_match($1,$2::jsonb) as id", [
    ids.league,
    JSON.stringify({ ...input(n), ...changes }),
  ]);
const admin = (action: string, data: Record<string, unknown>) =>
  db.query("select public.admin_command($1,$2,$3::jsonb)", [
    ids.league,
    action,
    JSON.stringify(data),
  ]);
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_league.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/003_variable_goals.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into auth.users values($1),($2),($3)", [
    ids.admin,
    ids.player,
    ids.outsider,
  ]);
  await db.query("insert into public.leagues(id,name) values($1,'Pruebas')", [
    ids.league,
  ]);
  await db.query(
    "insert into public.league_memberships values($1,$2,'admin',true),($1,$3,'player',true)",
    [ids.league, ids.admin, ids.player],
  );
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'Otoño')",
    [ids.season, ids.league],
  );
  for (let i = 0; i < 4; i++)
    await db.query(
      "insert into public.players(id,league_id,name) values($1,$2,$3)",
      [uuid(i), ids.league, `Jugador ${i}`],
    );
});
afterAll(async () => db.close());
describe.sequential(
  "PostgreSQL real embebido: transacciones, RPC y RLS",
  () => {
    it("no da acceso a un usuario ajeno ni a un rol de lectura inexistente", async () => {
      await as(ids.outsider);
      expect(
        (await db.query("select * from public.matches")).rows,
      ).toHaveLength(0);
      await expect(save(1)).rejects.toThrow(/autorizado/);
      await expect(
        db.query("select public.league_snapshot($1)", [ids.league]),
      ).rejects.toThrow(/autorizado/);
      await db.exec("reset role;set role anon");
      await expect(save(1)).rejects.toThrow(/permission denied/);
    });
    it("permite al jugador registrar y consultar, sin escribir tablas directamente", async () => {
      await as(ids.player);
      const s = await save(1);
      expect(s.rows[0].id).toBeTruthy();
      expect(
        (await db.query("select * from public.match_participants")).rows,
      ).toHaveLength(4);
      await expect(db.query("delete from public.matches")).rejects.toThrow(
        /permission denied/,
      );
      await expect(admin("player.save", { name: "Intruso" })).rejects.toThrow(
        /administradores/,
      );
    });
    it("reintentos y solicitudes simultáneas de una misma operación crean una sola partida", async () => {
      await as(ids.player);
      const results = await Promise.all([save(2), save(2), save(2)]);
      expect(new Set(results.map((x) => x.rows[0].id)).size).toBe(1);
      await expect(save(2, { red_score: 3 })).rejects.toThrow(
        /datos distintos/,
      );
      expect(
        (await db.query("select * from public.matches")).rows,
      ).toHaveLength(2);
    });
    it("dos operaciones independientes no pisan resultados", async () => {
      await as(ids.player);
      const results = await Promise.all([save(3), save(4)]);
      expect(results[0].rows[0].id).not.toBe(results[1].rows[0].id);
      expect(
        (await db.query("select * from public.matches")).rows,
      ).toHaveLength(4);
    });
    it("rechaza posiciones y jugadores duplicados o marcadores inválidos sin dejar restos", async () => {
      await as(ids.player);
      await expect(
        save(5, {
          participants: [
            participants[0],
            participants[0],
            participants[2],
            participants[3],
          ],
        }),
      ).rejects.toThrow(/distintos/);
      await expect(
        save(5, {
          participants: participants.map((p) => ({
            ...p,
            position: "defender",
          })),
        }),
      ).rejects.toThrow(/Posiciones/);
      await expect(save(5, { blue_score: 2 })).rejects.toThrow(/Marcador/);
      await expect(save(5, { blue_score: 5.5 })).rejects.toThrow();
      expect(
        (await db.query("select * from public.matches")).rows,
      ).toHaveLength(4);
    });
    it("guarda marcadores de 2, 3 y otros goles con las mismas reglas de acceso", async () => {
      await as(ids.player);
      for (const [i, a, b] of [
        [20, 2, 1],
        [21, 3, 2],
        [22, 4, 7],
      ]) {
        const result = await save(i, { blue_score: a, red_score: b });
        expect(result.rows[0].id).toBeTruthy();
      }
      await expect(save(23, { blue_score: 100, red_score: 0 })).rejects.toThrow(
        /Marcador/,
      );
    });
    it("solo el administrador corrige y una revisión antigua no sobrescribe cambios", async () => {
      await as(ids.player);
      const id = (await save(6)).rows[0].id;
      const call = (revision: number) =>
        db.query("select public.save_match($1,$2::jsonb,$3,$4,$5)", [
          ids.league,
          JSON.stringify({ ...input(7), red_score: 1 }),
          id,
          revision,
          "Error de marcador",
        ]);
      await expect(call(1)).rejects.toThrow(/autorizado/);
      await as(ids.admin);
      await call(1);
      expect(
        (
          await db.query<{ red_score: number }>(
            "select red_score from public.matches where id=$1",
            [id],
          )
        ).rows[0].red_score,
      ).toBe(1);
      await expect(
        db.query("select public.save_match($1,$2::jsonb,$3,1,$4)", [
          ids.league,
          JSON.stringify(input(8)),
          id,
          "Otro cambio",
        ]),
      ).rejects.toThrow(/cambiado/);
      expect(
        (
          await db.query(
            "select * from public.audit_log where action='match.correct'",
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("anulación conserva trazabilidad y protege contra revisiones antiguas", async () => {
      await as(ids.player);
      const id = (await save(9)).rows[0].id;
      await expect(
        admin("match.void", { id, revision: 1, reason: "Error" }),
      ).rejects.toThrow(/administradores/);
      await as(ids.admin);
      await admin("match.void", {
        id,
        revision: 1,
        reason: "Duplicada por error humano",
      });
      expect(
        (
          await db.query<{ status: string }>(
            "select status from public.matches where id=$1",
            [id],
          )
        ).rows[0].status,
      ).toBe("void");
      await expect(
        admin("match.void", { id, revision: 1, reason: "Otra vez" }),
      ).rejects.toThrow(/modificada/);
    });
    it("prohíbe quitar al último admin y permite revocar a un jugador", async () => {
      await as(ids.admin);
      await expect(
        admin("membership.save", {
          user_id: ids.admin,
          role: "player",
          active: true,
        }),
      ).rejects.toThrow(/al menos/);
      await admin("membership.save", {
        user_id: ids.player,
        role: "player",
        active: false,
      });
      await as(ids.player);
      await expect(save(10)).rejects.toThrow(/autorizado/);
      await expect(
        db.query("select public.league_snapshot($1)", [ids.league]),
      ).rejects.toThrow(/autorizado/);
      await as(ids.admin);
    });
    it("cierra temporada, congela reglas/resultados y separa la nueva", async () => {
      await admin("season.close", { id: ids.season });
      await expect(save(11)).rejects.toThrow(/inactiva/);
      await expect(
        admin("season.configure", {
          id: ids.season,
          ...{
            minimum: 5,
            prior_wins: 10,
            prior_games: 20,
            pair_minimum: 10,
            target: 5,
          },
        }),
      ).rejects.toThrow(/activa/);
      await admin("season.create", { name: "Invierno" });
      const rows = await db.query<{ status: string; final_results: unknown }>(
        "select status,final_results from public.seasons where id=$1",
        [ids.season],
      );
      expect(rows.rows[0].status).toBe("closed");
      expect(rows.rows[0].final_results).toBeTruthy();
      const snap = await db.query<{
        snapshot: { matches: unknown[]; seasons: unknown[] };
      }>("select public.league_snapshot($1) as snapshot", [ids.league]);
      expect(snap.rows[0].snapshot.seasons).toHaveLength(2);
      expect(snap.rows[0].snapshot.matches.length).toBeGreaterThan(0);
    });
  },
);
