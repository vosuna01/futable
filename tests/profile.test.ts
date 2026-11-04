import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const id = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jpeg = "data:image/jpeg;base64,/9j/AAAA";
async function as(n: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id(n),
  ]);
  await db.exec("set role authenticated");
}
const save = (name: string, avatar: string | null = null, league = id(1)) =>
  db.query<{ id: string }>("select public.save_my_profile($1,$2,$3) id", [
    league,
    name,
    avatar,
  ]);
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  for (const file of [
    "001_league.sql",
    "002_self_registration.sql",
    "003_variable_goals.sql",
    "004_self_profile.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    id(2),
    id(3),
    id(4),
  ]);
  await db.query(
    "insert into public.leagues(id,name) values($1,'Liga'),($2,'Otra liga')",
    [id(1), id(9)],
  );
  await db.query(
    "insert into public.league_memberships values($1,$2,'player',true),($1,$3,'player',true)",
    [id(1), id(2), id(3)],
  );
  for (let i = 0; i < 4; i++)
    await db.query(
      "insert into public.players(id,league_id,name,account_id) values($1,$2,$3,$4)",
      [id(10 + i), id(1), "Jugador " + i, i < 2 ? id(2 + i) : null],
    );
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'Temporada')",
    [id(20), id(1)],
  );
  await db.query(
    "insert into public.matches(id,league_id,season_id,blue_score,red_score,created_by,operation_id) values($1,$2,$3,2,1,$4,$5)",
    [id(21), id(1), id(20), id(2), id(22)],
  );
  for (let i = 0; i < 4; i++)
    await db.query(
      "insert into public.match_participants values($1,$2,$3,$4,$5)",
      [
        id(21),
        id(1),
        id(10 + i),
        i < 2 ? "blue" : "red",
        i % 2 ? "forward" : "defender",
      ],
    );
});
afterAll(() => db.close());
describe.sequential("perfiles propios: identidad, permisos y fotos", () => {
  it("bloquea anónimos, ajenos y otras ligas", async () => {
    await db.exec("set role anon");
    await expect(save("Intruso")).rejects.toThrow(/permission denied/);
    await as(4);
    await expect(save("Intruso")).rejects.toThrow(/autorizado/);
    await as(2);
    await expect(save("Intruso", null, id(9))).rejects.toThrow(/autorizado/);
  });
  it("edita solo la ficha propia, conserva IDs, partidas y rol", async () => {
    await as(2);
    expect((await save("  Nuevo apodo  ", jpeg)).rows[0].id).toBe(id(10));
    const rows = (
      await db.query<{ id: string; name: string; avatar_url: string | null }>(
        "select * from public.players order by id",
      )
    ).rows;
    expect(rows[0]).toMatchObject({
      id: id(10),
      name: "Nuevo apodo",
      avatar_url: jpeg,
    });
    expect(rows[1]).toMatchObject({
      id: id(11),
      name: "Jugador 1",
      avatar_url: null,
    });
    expect((await db.query("select * from public.matches")).rows).toHaveLength(
      1,
    );
    expect(
      (await db.query("select * from public.match_participants")).rows,
    ).toHaveLength(4);
    expect(
      (
        await db.query<{ role: string }>(
          "select role from public.league_memberships where user_id=$1",
          [id(2)],
        )
      ).rows[0].role,
    ).toBe("player");
    expect(
      (
        await db.query<{ display_name: string }>(
          "select display_name from public.user_profiles",
        )
      ).rows[0].display_name,
    ).toBe("Nuevo apodo");
  });
  it("rechaza nombres vacíos, demasiado largos y fotos inválidas o grandes", async () => {
    await as(2);
    for (const name of ["  ", "x".repeat(61)])
      await expect(save(name)).rejects.toThrow(/nombre/);
    for (const photo of [
      "https://external.test/photo.jpg",
      "data:image/svg+xml;base64,PHN2Zz4=",
      jpeg + "A".repeat(48000),
    ])
      await expect(save("Nombre", photo)).rejects.toThrow(/foto/);
  });
  it("puede quitar la foto y no almacena copias de imágenes en la auditoría", async () => {
    await as(2);
    await save("Sin foto");
    expect(
      (
        await db.query<{ avatar_url: null }>(
          "select avatar_url from public.players where id=$1",
          [id(10)],
        )
      ).rows[0].avatar_url,
    ).toBeNull();
    await db.exec("reset role");
    const audit = await db.query(
      "select before_data,after_data from public.audit_log",
    );
    expect(JSON.stringify(audit.rows)).not.toContain("base64");
    expect(audit.rows).toHaveLength(2);
  });
  it("una cuenta revocada o una ficha inactiva no puede editar", async () => {
    await db.exec("reset role");
    await db.query("update public.players set active=false where id=$1", [
      id(10),
    ]);
    await as(2);
    await expect(save("No permitido")).rejects.toThrow(/activo/);
    await db.exec("reset role");
    await db.query(
      "update public.league_memberships set active=false where user_id=$1",
      [id(3)],
    );
    await as(3);
    await expect(save("No permitido")).rejects.toThrow(/autorizado/);
  });
});
