import { forecast } from "../src/domain/odds";
import type { Match, Player, Season } from "../src/domain/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { LiveSession } from "../src/domain/live";
import type { CoinsSnapshot } from "../src/domain/coins";
const db = new PGlite();
const id = (n: number) =>
  `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const l = id(1),
  s = id(2),
  admin = id(3),
  viewer = id(4),
  other = id(5),
  p = (n: number) => id(20 + n);
let op = 100,
  k: LiveSession;
let historical: string;
let firstReturn = 0;
const historicalInput = {
  season_id: s,
  red_score: null,
  blue_score: null,
  winner: "red",
  participants: [
    { player_id: p(1), team: "red", position: "defender" },
    { player_id: p(2), team: "red", position: "forward" },
    { player_id: p(3), team: "blue", position: "defender" },
    { player_id: p(4), team: "blue", position: "forward" },
  ],
};
async function as(u: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]);
  await db.exec("set role authenticated");
}
async function live(action: string, fields: Record<string, unknown> = {}) {
  k = (
    await db.query<{ v: LiveSession }>(
      "select public.live_session_command($1,$2,$3) v",
      [
        l,
        action,
        JSON.stringify({
          season_id: s,
          session_id: k?.id,
          revision: k?.revision,
          expected_revision: k?.revision,
          operation_id: id(op++),
          ...fields,
        }),
      ],
    )
  ).rows[0].v;
  return k;
}
const body = (x: Record<string, unknown> = {}) => ({
  operation_id: id(op++),
  season_id: s,
  ...x,
});
async function send(action: string, b: Record<string, unknown>) {
  await db.query("select public.coins_command($1,$2,$3)", [
    l,
    action,
    JSON.stringify(b),
  ]);
}
async function snap() {
  return (
    await db.query<{ v: CoinsSnapshot }>(
      "select public.coins_snapshot($1,$2) v",
      [l, s],
    )
  ).rows[0].v;
}
const bet = async (team = "red", stake = 10) => {
  const m = (await snap()).market!;
  return body({
    market_id: m.id,
    revision: m.revision,
    team,
    stake,
    expected_odds: m.odds![team as "red" | "blue"],
  });
};
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const files = [
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
  ];
  for (const f of files)
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${f}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    admin,
    viewer,
    other,
  ]);
  await db.query("insert into public.leagues(id,name) values($1,'Coins QA')", [
    l,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name,minimum,pair_minimum) values($1,$2,'QA',1,1)",
    [s, l],
  );
  await db.query(
    "insert into public.league_memberships(league_id,user_id,role) values($1,$2,'admin'),($1,$3,'player'),($1,$4,'player')",
    [l, admin, viewer, other],
  );
  for (let n = 1; n <= 8; n++)
    await db.query(
      "insert into public.players(id,league_id,name,account_id) values($1,$2,$3,$4)",
      [
        p(n),
        l,
        `Player ${n}`,
        n === 1 ? admin : n === 7 ? viewer : n === 8 ? other : null,
      ],
    );
  await as(admin);
  historical = (
    await db.query<{ v: string }>("select public.save_match($1,$2) v", [
      l,
      JSON.stringify({ ...historicalInput, operation_id: id(op++) }),
    ])
  ).rows[0].v;
  await db.exec("reset role");
  await db.query(
    "update public.matches set created_at=now()-interval '1 day' where id=$1",
    [historical],
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/012_coins_honours.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/013_fixed_odds.sql", import.meta.url),
      "utf8",
    ),
  );
  await as(admin);
  await live("join", { players: [1, 2, 3, 4, 5, 6].map(p) });
  await live("start", {
    lineup: {
      red: { defender: p(1), forward: p(2) },
      blue: { defender: p(3), forward: p(4) },
    },
  });
}, 30000);
afterAll(() => db.close());
describe.sequential(
  "Cuotas fijas · servidor, premios, devoluciones y correcciones",
  () => {
    it("las cuotas del servidor coinciden con el pronóstico de posiciones y pareja", async () => {
      await db.exec("reset role");
      const matches = (
        await db.query<{ m: Match }>(
          "select to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where p.match_id=m.id)) m from public.matches m where season_id=$1",
          [s],
        )
      ).rows.map((r) => r.m);
      const players = (
        await db.query<Player>(
          "select * from public.players where league_id=$1",
          [l],
        )
      ).rows;
      const season = (
        await db.query<{ s: Season }>(
          "select to_jsonb(s) s from public.seasons s where id=$1",
          [s],
        )
      ).rows[0].s;
      const f = forecast(k.state, players, matches, season)!;
      await as(viewer);
      expect((await snap()).market!.odds).toEqual({
        red: f.red.decimal,
        blue: f.blue.decimal,
      });
    });
    it("no concede premios al instalar ni al corregir una partida anterior a coins", async () => {
      await as(admin);
      expect((await snap()).standings).toHaveLength(0);
      await db.query("select public.save_match($1,$2,$3,$4,$5)", [
        l,
        JSON.stringify({
          ...historicalInput,
          winner: "blue",
          operation_id: id(op++),
        }),
        historical,
        1,
        "QA historial",
      ]);
      expect((await snap()).standings).toHaveLength(0);
    });
    it("bloquea llamadas internas y escrituras directas", async () => {
      await as(viewer);
      await expect(
        db.query("select public._coin_wallet($1,$2,$3)", [l, s, p(7)]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.exec("update public.coin_wallets set balance=999"),
      ).rejects.toThrow(/permission denied/);
    });
    it("da una bienvenida, incluso con reintentos y nuevos operation_id", async () => {
      const b = body();
      await send("claim", b);
      await send("claim", b);
      await send("claim", body());
      expect((await snap()).wallet?.balance).toBe(100);
      expect((await snap()).ledger).toHaveLength(1);
    });
    it("no permite apostar a jugadores en pista ni sobre una revisión antigua", async () => {
      await as(admin);
      await expect(send("bet", await bet())).rejects.toThrow(/espectadores/);
      await as(viewer);
      const b = await bet();
      await as(admin);
      await live("goal", { team: "red", delta: 1 });
      await as(viewer);
      await expect(send("bet", b)).rejects.toThrow(/cambiado/);
    });
    it("rechaza cuotas manipuladas y clientes antiguos sin tocar el saldo", async () => {
      const b = await bet();
      await expect(send("bet", { ...b, expected_odds: 99 })).rejects.toThrow(
        /cuota/,
      );
      await expect(
        send("bet", { ...b, expected_odds: undefined }),
      ).rejects.toThrow(/cuota/);
      expect((await snap()).wallet?.balance).toBe(100);
    });
    it("escrow, una apuesta por mercado e idempotencia estricta", async () => {
      const b = await bet("red", 10);
      await send("bet", b);
      await send("bet", b);
      expect((await snap()).wallet?.balance).toBe(90);
      await expect(send("bet", { ...b, stake: 11 })).rejects.toThrow(
        /distinta/,
      );
      await expect(send("bet", await bet("blue", 10))).rejects.toThrow(
        /Ya has apostado/,
      );
      const fixed = (await snap()).market!.own_bet!.odds;
      await as(other);
      await expect(send("bet", await bet("red", 26))).rejects.toThrow(
        /no válida/,
      );
      await send("bet", await bet("blue", 20));
      expect((await snap()).wallet?.balance).toBe(80);
      await as(viewer);
      expect((await snap()).market!.own_bet!.odds).toBe(fixed);
    });
    it("cierra al objetivo y paga la cuota y +5 a cada ganador una sola vez", async () => {
      await as(admin);
      await live("goal", { team: "red", delta: 1 });
      await live("goal", { team: "red", delta: 1 });
      await as(viewer);
      expect((await snap()).market?.status).toBe("locked");
      await as(admin);
      await live("result", { winner: "red" });
      await as(viewer);
      const a = await snap();
      firstReturn = Math.floor(10 * a.bets[0].odds!);
      expect(a.wallet?.balance).toBe(90 + firstReturn);
      expect(a.bets[0].returned).toBe(firstReturn);
      expect(firstReturn).not.toBe(30);
      expect(a.standings.find((w) => w.player_id === p(1))?.balance).toBe(105);
      await as(other);
      expect((await snap()).wallet?.balance).toBe(80);
    });
    it("deshacer revierte premio y reparto y devuelve también apuestas del siguiente turno", async () => {
      await as(viewer);
      await send("bet", await bet("red", 5));
      expect((await snap()).wallet?.balance).toBe(85 + firstReturn);
      await as(admin);
      await live("undo");
      await as(viewer);
      const a = await snap();
      expect(a.wallet?.balance).toBe(100);
      expect(a.standings.find((w) => w.player_id === p(1))?.balance).toBe(100);
      expect(a.bets.every((b) => b.status === "cancelled")).toBe(true);
      await as(other);
      expect((await snap()).wallet?.balance).toBe(100);
    });
    it("sustituir pareja o cambiar objetivo devuelve apuestas y abre otro mercado", async () => {
      await as(admin);
      await live("goal", { team: "red", delta: -1 });
      await as(viewer);
      await send("bet", await bet());
      const old = (await snap()).market!.id;
      await as(admin);
      await live("replace", { team: "blue", defender: p(5), forward: p(6) });
      await as(viewer);
      expect((await snap()).wallet?.balance).toBe(100);
      expect((await snap()).market!.id).not.toBe(old);
      await send("bet", await bet());
      await as(admin);
      await live("target", { goals: 5 });
      await as(viewer);
      expect((await snap()).wallet?.balance).toBe(100);
    });
    it("corregir el ganador mueve premios y liquida de nuevo; anular devuelve el importe", async () => {
      await send("bet", await bet("blue", 10));
      await as(other);
      await send("bet", await bet("red", 20));
      await as(admin);
      await live("result", { winner: "red" });
      const mid = k.last_match!;
      await db.exec("reset role");
      const match = (
        await db.query<{ v: Record<string, unknown> }>(
          "select to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(p) from public.match_participants p where match_id=m.id)) v from public.matches m where id=$1",
          [mid],
        )
      ).rows[0].v;
      await as(admin);
      await db.query("select public.save_match($1,$2,$3,$4,$5)", [
        l,
        JSON.stringify({
          operation_id: id(op++),
          season_id: s,
          blue_score: null,
          red_score: null,
          winner: "blue",
          participants: match.participants,
        }),
        mid,
        1,
        "Corregir ganador QA",
      ]);
      await as(viewer);
      const corrected = await snap();
      expect(corrected.wallet?.balance).toBe(
        90 +
          Math.floor(
            10 *
              corrected.bets.find(
                (b) => b.team === "blue" && b.status === "settled",
              )!.odds!,
          ),
      );
      await as(other);
      expect((await snap()).wallet?.balance).toBe(80);
      await as(admin);
      await db.query("select public.save_match($1,$2,$3,$4,$5)", [
        l,
        JSON.stringify({
          operation_id: id(op++),
          season_id: s,
          blue_score: null,
          red_score: null,
          winner: "blue",
          participants: (match.participants as { player_id: string }[]).map(
            (p0) => ({
              ...p0,
              player_id: p0.player_id === p(1) ? p(7) : p0.player_id,
            }),
          ),
        }),
        mid,
        2,
        "QA cambiar integrante",
      ]);
      await as(viewer);
      expect((await snap()).wallet?.balance).toBe(100);
      await as(other);
      expect((await snap()).wallet?.balance).toBe(100);
      await as(admin);
      await db.query("select public.admin_command($1,$2,$3)", [
        l,
        "match.void",
        JSON.stringify({ id: mid, revision: 3, reason: "QA anulación" }),
      ]);
      await as(viewer);
      expect((await snap()).wallet?.balance).toBe(100);
      await as(other);
      expect((await snap()).wallet?.balance).toBe(100);
    });
    it("impide gastar por encima del saldo y devuelve al desactivar coins", async () => {
      await as(admin);
      await send(
        "settings",
        body({ enabled: true, initial: 100, win_bonus: 5, max_stake: 200 }),
      );
      await as(viewer);
      await expect(send("bet", await bet("red", 101))).rejects.toThrow(
        /insuficiente/,
      );
      await send("bet", await bet("red", 25));
      await as(admin);
      await send(
        "settings",
        body({ enabled: false, initial: 100, win_bonus: 5, max_stake: 25 }),
      );
      await as(viewer);
      expect((await snap()).wallet?.balance).toBe(100);
      expect((await snap()).market).toBeNull();
    });
    it("solo publica un admin, en temporada cerrada, conservando nombres", async () => {
      const awards = [{ title: "Campeón de coins", players: [p(7)] }];
      await expect(send("publish", body({ awards }))).rejects.toThrow(
        /administradores/,
      );
      await as(admin);
      await expect(send("publish", body({ awards }))).rejects.toThrow(
        /Cierra primero/,
      );
      await expect(
        db.query("select public.admin_command($1,$2,$3)", [
          l,
          "season.close",
          JSON.stringify({ id: s }),
        ]),
      ).rejects.toThrow(/sesión en directo/);
      await live("close");
      await db.query("select public.admin_command($1,$2,$3)", [
        l,
        "season.close",
        JSON.stringify({ id: s }),
      ]);
      const b = body({ awards });
      await send("publish", b);
      await send("publish", b);
      expect((await snap()).honours[0].awards[0].players[0].name).toBe(
        "Player 7",
      );
      await expect(send("publish", body({ awards }))).rejects.toThrow(
        /duplicate key/,
      );
      await as(other);
      await expect(
        db.query("select public.coins_snapshot($1,$2)", [id(999), s]),
      ).rejects.toThrow(/Sin acceso/);
    });
  },
);
