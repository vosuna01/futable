import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const league = "30000000-0000-4000-8000-000000000001";
const user = (n: number) =>
  `30000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`;
async function as(n: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user(n),
  ]);
  await db.exec("set role authenticated");
}
const join = () =>
  db.query<{ id: string }>("select public.join_open_league() as id");
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_league.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into public.leagues(id,name) values($1,'Córdoba')", [
    league,
  ]);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/002_self_registration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (let i = 0; i < 5; i++)
    await db.query("insert into auth.users values($1,$2,$3)", [
      user(i),
      i === 1 ? null : new Date().toISOString(),
      JSON.stringify({
        display_name: i === 0 ? "  Andrea  " : "Jugador " + i,
        role: "admin",
      }),
    ]);
});
afterAll(() => db.close());
describe.sequential("registro personal y acceso a la liga", () => {
  it("deniega acceso anónimo", async () => {
    await db.exec("set role anon");
    await expect(join()).rejects.toThrow(/permission denied/);
  });
  it("exige correo confirmado en Auth", async () => {
    await as(1);
    await expect(join()).rejects.toThrow(/Confirma tu correo/);
    expect((await db.query("select * from public.players")).rows).toHaveLength(
      0,
    );
  });
  it("crea membresía, perfil y jugador sin confiar en el rol del usuario", async () => {
    await as(0);
    expect((await join()).rows[0].id).toBe(league);
    const snapshot = await db.query<{
      s: { role: string; players: { name: string; account_id: string }[] };
    }>("select public.league_snapshot($1) s", [league]);
    expect(snapshot.rows[0].s.role).toBe("player");
    expect(snapshot.rows[0].s.players[0]).toMatchObject({
      name: "Andrea",
      account_id: user(0),
    });
    await expect(
      db.query(
        "select public.admin_command($1,'player.save','{\"name\":\"Intruso\"}')",
        [league],
      ),
    ).rejects.toThrow(/administradores/);
  });
  it("los reintentos no duplican jugador ni auditoría", async () => {
    await as(0);
    await Promise.all([join(), join(), join()]);
    expect((await db.query("select * from public.players")).rows).toHaveLength(
      1,
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select * from public.audit_log where action='account.join'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("una cuenta revocada no recupera acceso mediante autoalta", async () => {
    await db.exec("reset role");
    await db.query(
      "update public.league_memberships set active=false where user_id=$1",
      [user(0)],
    );
    await as(0);
    await expect(join()).rejects.toThrow(/revocado/);
    expect((await db.query("select * from public.players")).rows).toHaveLength(
      0,
    );
  });
  it("respeta los administradores existentes sin crearles otro jugador", async () => {
    await db.exec("reset role");
    await db.query(
      "insert into public.league_memberships values($1,$2,'admin',true)",
      [league, user(2)],
    );
    await as(2);
    await join();
    expect(
      (
        await db.query<{ role: string }>(
          "select role from public.league_memberships where user_id=$1",
          [user(2)],
        )
      ).rows[0].role,
    ).toBe("admin");
    expect(
      (
        await db.query("select * from public.players where account_id=$1", [
          user(2),
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("solo permite altas en la liga configurada y no expone configuración", async () => {
    await as(3);
    await expect(
      db.query("select * from public.registration_settings"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    await db.query("delete from public.registration_settings");
    await as(3);
    await expect(join()).rejects.toThrow(/preparada/);
  });
});
