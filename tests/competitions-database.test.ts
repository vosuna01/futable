import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const db = new PGlite();
const id = (n: number) =>
  `81000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  user = id(2),
  old = id(3),
  p = (n: number) => id(100 + n);
let season = "",
  cup = "",
  session = "",
  revision = 0;
let op = 500;
async function command(action: string, input: Record<string, unknown> = {}) {
  const r = await db.query<{ v: any }>(
    "select public.live_session_command($1,$2,$3) v",
    [
      league,
      action,
      JSON.stringify({
        season_id: cup,
        session_id: session || undefined,
        revision: session ? revision : undefined,
        operation_id: id(++op),
        ...input,
      }),
    ],
  );
  const v = r.rows[0].v;
  session = v.id;
  revision = v.revision;
  return v;
}
async function comp(action: string, input: object = {}) {
  return (
    await db.query<{ v: string }>(
      "select public.competition_command($1,$2,$3) v",
      [league, action, JSON.stringify({ operation_id: id(++op), ...input })],
    )
  ).rows[0].v;
}
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  await db.query<any>("insert into auth.users(id) values($1)", [user]);
  await db.query<any>(
    "insert into public.leagues(id,name) values($1,'Competition QA')",
    [league],
  );
  await db.query<any>(
    "insert into public.league_memberships(league_id,user_id,role) values($1,$2,'admin')",
    [league, user],
  );
  await db.query<any>(
    "insert into public.seasons(id,league_id,name) values($1,$2,'T1')",
    [old, league],
  );
  for (let i = 0; i < 6; i++)
    await db.query<any>(
      "insert into public.players(id,league_id,name) values($1,$2,$3)",
      [p(i), league, `P${i}`],
    );
  await db.query<any>(
    "insert into public.coin_settings(league_id) values($1)",
    [league],
  );
  await db.query<any>("select set_config('request.jwt.claim.sub',$1,false)", [
    user,
  ]);
  const mid = id(20);
  await db.query<any>(
    "insert into public.matches(id,league_id,season_id,winner,blue_score,red_score,created_by,operation_id) values($1,$2,$3,'red',1,3,$4,$5)",
    [mid, league, old, user, id(21)],
  );
  for (let i = 0; i < 4; i++)
    await db.query<any>(
      "insert into public.match_participants(match_id,league_id,player_id,team,position) values($1,$2,$3,$4,$5)",
      [
        mid,
        league,
        p(i),
        i < 2 ? "red" : "blue",
        i % 2 ? "forward" : "defender",
      ],
    );
});
afterAll(() => db.close());
describe.sequential("League and Cup production migration", () => {
  it("archives legacy results and resets a new era without deleting history", async () => {
    season = await comp("reset", {
      expected_matches: 1,
      expected_hash: (
        await db.query<any>(
          "select md5(string_agg(id::text||':'||revision::text||':'||status,',' order by id)) h from public.matches where league_id=$1",
          [league],
        )
      ).rows[0].h,
      name: "T2",
    });
    expect(
      (
        await db.query<any>(
          "select status,final_results from public.seasons where id=$1",
          [old],
        )
      ).rows[0],
    ).toMatchObject({ status: "closed" });
    expect(
      (await db.query<any>("select count(*)::int n from public.matches"))
        .rows[0].n,
    ).toBe(1);
    const ratings = await db.query<{ mmr: number; games: number }>(
      "select * from public._mmr_ratings($1)",
      [league],
    );
    expect(ratings.rows).toHaveLength(6);
    expect(ratings.rows.every((r) => r.mmr === 1000 && r.games === 0)).toBe(
      true,
    );
  });
  it("creates a separate cup and rejects a league tennis start", async () => {
    cup = await comp("cup.create", { name: "Afterwork QA", target: 2 });
    let v = await command("join", {
      season_id: season,
      players: [p(0), p(1), p(2), p(3)],
    });
    await expect(
      command("start", {
        season_id: season,
        lineup: {
          red: { defender: p(0), forward: p(1) },
          blue: { defender: p(2), forward: p(3) },
        },
        series: { best_of: 3 },
      }),
    ).rejects.toThrow(/tenis/);
    await command("close", { season_id: season });
    session = "";
    revision = 0;
    v = await command("join", { players: [p(0), p(1), p(2), p(3)] });
    expect(v.season_id).toBe(cup);
    await expect(
      command("goal", { season_id: season, team: "red", delta: 1 }),
    ).rejects.toThrow(/otra (competición|temporada)/);
  });
  it("stores durable tennis partials and credits the series bonus only once", async () => {
    await command("start", {
      lineup: {
        red: { defender: p(0), forward: p(1) },
        blue: { defender: p(2), forward: p(3) },
      },
      series: { best_of: 3 },
      is_final: true,
    });
    for (let g = 0; g < 2; g++) {
      await command("goal", { team: "red", delta: 2, player: p(0) });
      await command("result", { winner: "red" });
      const w = (
        await db.query<any>(
          "select balance from public.coin_wallets where season_id=$1 and player_id=$2",
          [cup, p(0)],
        )
      ).rows[0];
      expect(Number(w.balance)).toBe(g === 0 ? 100 : 105);
    }
    const matches = (
      await db.query<any>(
        "select series_id,goal_target,live_session_id,series_decider from public.matches where season_id=$1",
        [cup],
      )
    ).rows;
    expect(matches).toHaveLength(2);
    expect(
      matches.every(
        (m) =>
          m.series_id === matches[0].series_id &&
          m.goal_target === 2 &&
          m.live_session_id === session,
      ),
    ).toBe(true);
    expect(matches.filter((m) => m.series_decider)).toHaveLength(1);
    expect(
      (
        await db.query<any>(
          "select status from public.competition_series where season_id=$1",
          [cup],
        )
      ).rows[0].status,
    ).toBe("finished");
  });
  it("keeps League ratings at 1000 while general ratings reflect the Cup", async () => {
    const global = (
      await db.query<{ mmr: number }>(
        "select mmr from public._mmr_ratings($1) where player_id=$2",
        [league, p(0)],
      )
    ).rows[0];
    expect(global.mmr).toBeGreaterThan(1000);
    const own = (
      await db.query<{ mmr: number }>(
        "select mmr from public._competition_ratings($1,$2,false) where player_id=$3",
        [league, season, p(0)],
      )
    ).rows[0];
    expect(own.mmr).toBe(1000);
  });
  it("undo restores the final and refunds its win bonus before retrying", async () => {
    await command("undo");
    expect(
      (
        await db.query<any>(
          "select cup_result from public.seasons where id=$1",
          [cup],
        )
      ).rows[0].cup_result,
    ).toBeNull();
    expect(
      Number(
        (
          await db.query<any>(
            "select balance from public.coin_wallets where season_id=$1 and player_id=$2",
            [cup, p(0)],
          )
        ).rows[0].balance,
      ),
    ).toBe(100);
    await command("goal", { team: "red", delta: 2, player: p(0) });
    await command("result", { winner: "red" });
    expect(
      Number(
        (
          await db.query<any>(
            "select balance from public.coin_wallets where season_id=$1 and player_id=$2",
            [cup, p(0)],
          )
        ).rows[0].balance,
      ),
    ).toBe(105);
  });
  it("publishes Cup winners independently of the active League", async () => {
    await comp("cup.close", { id: cup });
    expect(
      (
        await db.query<any>("select status from public.seasons where id=$1", [
          cup,
        ])
      ).rows[0].status,
    ).toBe("closed");
    expect(
      (
        await db.query<any>("select status from public.seasons where id=$1", [
          season,
        ])
      ).rows[0].status,
    ).toBe("active");
    expect(
      (
        await db.query<any>(
          "select awards from public.season_honours where season_id=$1",
          [cup],
        )
      ).rows[0].awards[0].title,
    ).toBe("Campeones de Copa");
  });
  it("buys cosmetics once, fixes server prices and protects the coins classification", async () => {
    await db.query<any>("update public.players set account_id=$1 where id=$2", [
      user,
      p(0),
    ]);
    const operation = id(++op),
      input = {
        operation_id: operation,
        item_id: "glasses",
        expected_cost: 40,
        season_id: season,
      };
    await db.query<any>("select public.shop_command($1,'buy',$2)", [
      league,
      JSON.stringify(input),
    ]);
    await db.query<any>("select public.shop_command($1,'buy',$2)", [
      league,
      JSON.stringify(input),
    ]);
    const snapshot = (
      await db.query<any>("select public.coins_snapshot($1,$2) v", [
        league,
        season,
      ])
    ).rows[0].v;
    expect(Number(snapshot.wallet.balance)).toBe(60);
    expect(snapshot.standings[0].score).toBe(100);
    await expect(
      db.query<any>("select public.shop_command($1,'buy',$2)", [
        league,
        JSON.stringify({ ...input, operation_id: id(++op) }),
      ]),
    ).rejects.toThrow(/Ya tienes/);
    await expect(
      db.query<any>("select public.shop_command($1,'buy',$2)", [
        league,
        JSON.stringify({
          ...input,
          item_id: "cap",
          expected_cost: 1,
          operation_id: id(++op),
        }),
      ]),
    ).rejects.toThrow(/precio/);
    await expect(
      db.query<any>("select public.shop_command($1,'buy',$2)", [
        league,
        JSON.stringify({
          ...input,
          item_id: "crown",
          expected_cost: 150,
          operation_id: id(++op),
        }),
      ]),
    ).rejects.toThrow(/insuficientes/);
  });
  it("equips only owned cosmetics and exposes the outfit, not the sprite, in snapshots", async () => {
    await expect(
      db.query<any>("select public.shop_command($1,'equip',$2)", [
        league,
        JSON.stringify({ operation_id: id(++op), items: ["crown"] }),
      ]),
    ).rejects.toThrow(/tuyos/);
    await db.query<any>("select public.shop_command($1,'equip',$2)", [
      league,
      JSON.stringify({ operation_id: id(++op), items: ["glasses"] }),
    ]);
    const snapshot = (
      await db.query<any>("select public.league_snapshot($1) v", [league])
    ).rows[0].v;
    expect(snapshot.loadouts[p(0)]).toEqual(["glasses"]);
    expect(snapshot.character_assets).toBeUndefined();
  });
  it("keeps sprites private to authenticated league members", async () => {
    await db.query<any>(
      "insert into public.character_assets(player_id,league_id,version,data_url) values($1,$2,'qa','data:image/webp;base64,AA==')",
      [p(0), league],
    );
    await db.exec("set role anon");
    await expect(
      db.query<any>("select * from public.character_assets"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    await db.query<any>("select set_config('request.jwt.claim.sub',$1,false)", [
      id(999),
    ]);
    await db.exec("set role authenticated");
    expect(
      (await db.query<any>("select * from public.character_assets")).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
    await db.query<any>("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
    expect(
      (await db.query<any>("select player_id from public.character_assets"))
        .rows,
    ).toHaveLength(1);
    await expect(
      db.query<any>("delete from public.character_assets"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
