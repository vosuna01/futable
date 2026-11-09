import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const id = (n: number) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const league = id(1),
  season = id(2),
  admin = id(3),
  outsider = id(4);
// Five accounts with a player card each, plus a sixth that never signs up.
const account = (n: number) => id(10 + n);
const player = (n: number) => id(20 + n);
interface Slot {
  id: string;
  waited: number;
}
interface State {
  round: number;
  goals: { blue: number; red: number };
  played: Record<string, number>;
  court: {
    blue: { defender: Slot; forward: Slot };
    red: { defender: Slot; forward: Slot };
  } | null;
  queue: { id: string; since: number }[];
}
let k: {
  id: string;
  revision: number;
  status: string;
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
    "select public.live_session_command($1,$2,$3) value",
    [league, action, JSON.stringify(input)],
  );
  return result.rows[0].value;
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
    // 008 must keep every earlier behaviour: the suite runs on top of it.
    "008_live_tablet",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
        "utf8",
      ),
    );
  for (const user of [admin, outsider, ...[1, 2, 3, 4, 5, 6].map(account)])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await db.query("insert into public.leagues(id,name) values($1,'Live QA')", [
    league,
  ]);
  await db.query(
    "insert into public.seasons(id,league_id,name) values($1,$2,'QA')",
    [season, league],
  );
  await db.query(
    "insert into public.league_memberships values($1,$2,$3,true)",
    [league, admin, "admin"],
  );
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await db.query(
      "insert into public.league_memberships values($1,$2,$3,true)",
      [league, account(n), "player"],
    );
    await db.query(
      "insert into public.players(id,league_id,name,account_id) values($1,$2,$3,$4)",
      [player(n), league, `Jugador ${n}`, account(n)],
    );
  }
}, 30000);
afterAll(async () => db.close());

describe.sequential("Partida en directo: cola, rotación y permisos", () => {
  it("el primer fichaje abre la sesión y nadie escribe la tabla a mano", async () => {
    await as(outsider);
    await expect(command("join", { players: [player(1)] })).rejects.toThrow(
      /autorizado/,
    );
    await as(account(1));
    k = await command("join", { players: [player(1)] });
    expect(k.revision).toBe(1);
    expect(k.state).toMatchObject({ round: 0, court: null });
    expect(k.state.queue.map((w) => w.id)).toEqual([player(1)]);
    await expect(
      db.query("insert into public.live_sessions(league_id) values($1)", [
        league,
      ]),
    ).rejects.toThrow(/permission/);
    await as(outsider);
    expect(
      (await db.query("select * from public.live_sessions")).rows,
    ).toHaveLength(0);
  });

  it("ficha y desficha respetando el orden de llegada", async () => {
    await as(account(2));
    k = await command("join", { players: [player(2), player(3)] });
    await expect(command("join", { players: [player(2)] })).rejects.toThrow(
      /ya está fichada/,
    );
    k = await command("join", { players: [player(4)] });
    k = await command("leave", { player: player(4) });
    expect(k.state.queue.map((w) => w.id)).toEqual([
      player(1),
      player(2),
      player(3),
    ]);
    await expect(command("leave", { player: player(4) })).rejects.toThrow(
      /no está esperando/,
    );
    // Four and five sign up again so the court has an odd queue behind it.
    k = await command("join", { players: [player(4), player(5)] });
    expect(k.state.queue).toHaveLength(5);
  });

  it("empieza con los cuatro primeros y los saca de la cola", async () => {
    await as(account(1));
    await expect(
      command("start", {
        lineup: {
          blue: { defender: player(1), forward: player(2) },
          red: { defender: player(3), forward: player(5) },
        },
      }),
    ).rejects.toThrow(/cuatro primeros/);
    await expect(
      command("start", {
        lineup: {
          blue: { defender: player(1), forward: player(2) },
          red: { defender: player(3), forward: player(6) },
        },
      }),
    ).rejects.toThrow(/fichados en la cola/);
    k = await command("start", {
      lineup: {
        blue: { defender: player(1), forward: player(2) },
        red: { defender: player(3), forward: player(4) },
      },
    });
    expect(k.state.court!.blue.defender).toEqual({ id: player(1), waited: 0 });
    expect(k.state.queue.map((w) => w.id)).toEqual([player(5)]);
    await expect(
      command("start", {
        lineup: {
          blue: { defender: player(1), forward: player(2) },
          red: { defender: player(3), forward: player(4) },
        },
      }),
    ).rejects.toThrow(/Ya hay una partida/);
  });

  it("solo quien está fichado apunta el resultado", async () => {
    await as(account(6));
    await expect(command("leave", { player: player(5) })).rejects.toThrow(
      /Fíchate/,
    );
    await expect(command("result", { winner: "blue" })).rejects.toThrow(
      /Fíchate/,
    );
    await as(outsider);
    await expect(command("result", { winner: "blue" })).rejects.toThrow(
      /autorizado/,
    );
  });

  it("guarda la partida y rota: uno de los perdedores vuelve ya, el otro espera", async () => {
    await as(account(5));
    k = await command("result", { winner: "blue" });
    expect(k.state.round).toBe(1);
    // Blue keeps both posts untouched.
    expect(k.state.court!.blue.defender.id).toBe(player(1));
    expect(k.state.court!.blue.forward.id).toBe(player(2));
    // The one who was waiting enters first; a loser takes the other post.
    expect(k.state.court!.red.defender).toEqual({ id: player(5), waited: 1 });
    expect([player(3), player(4)]).toContain(k.state.court!.red.forward.id);
    expect(k.state.court!.red.forward.waited).toBe(0);
    expect(k.state.queue).toHaveLength(1);
    expect([player(3), player(4)]).toContain(k.state.queue[0].id);
    expect(k.state.queue[0].id).not.toBe(k.state.court!.red.forward.id);
    const match = await db.query<{
      id: string;
      winner: string;
      blue_score: number | null;
    }>("select id,winner,blue_score from public.matches");
    expect(match.rows).toHaveLength(1);
    expect(match.rows[0].winner).toBe("blue");
    expect(match.rows[0].blue_score).toBeNull();
    expect(
      (
        await db.query(
          "select * from public.match_participants where match_id=$1",
          [match.rows[0].id],
        )
      ).rows,
    ).toHaveLength(4);
  });

  it("con esperas distintas el desempate deja de ser sorteo", async () => {
    const entered = k.state.court!.red.forward.id;
    const waiting = k.state.queue[0].id;
    await as(account(1));
    k = await command("result", { winner: "blue" });
    // Red's defender had waited one round, its forward none, so the defender
    // goes into the queue first and the longest wait comes back on.
    expect(k.state.court!.red.defender).toEqual({ id: waiting, waited: 1 });
    expect(k.state.court!.red.forward).toEqual({ id: player(5), waited: 0 });
    expect(k.state.queue.map((w) => w.id)).toEqual([entered]);
    expect(k.state.round).toBe(2);
  });

  it("reparte los puestos de quien acaba de entrar", async () => {
    const { defender, forward } = k.state.court!.red;
    await as(account(5));
    await expect(
      command("assign", {
        team: "red",
        defender: defender.id,
        forward: player(1),
      }),
    ).rejects.toThrow(/repartir los puestos/);
    k = await command("assign", {
      team: "red",
      defender: forward.id,
      forward: defender.id,
    });
    expect(k.state.court!.red.defender).toEqual(forward);
    expect(k.state.court!.red.forward).toEqual(defender);
  });

  it("rechaza revisiones viejas y repite operaciones sin duplicar", async () => {
    const stale = { ...k, revision: k.revision - 1 };
    const live = k;
    k = stale;
    await expect(command("result", { winner: "blue" })).rejects.toThrow(
      /ha cambiado/,
    );
    k = live;
    const op = id(900);
    const first = await command("result", { winner: "blue" }, op);
    const again = await command("result", { winner: "blue" }, op);
    expect(again.revision).toBe(first.revision);
    expect(
      (
        await db.query(
          "select count(*) n from public.matches where status='valid'",
        )
      ).rows[0],
    ).toEqual({ n: 3 });
    k = first;
  });

  it("deshacer anula la partida y devuelve la cola", async () => {
    const before = k.state;
    await as(account(1));
    k = await command("undo", {});
    expect(k.state.round).toBe(before.round - 1);
    expect(k.last_match).toBeNull();
    expect(
      (
        await db.query(
          "select count(*) n from public.matches where status='void'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await expect(command("undo", {})).rejects.toThrow(/No hay resultado/);
  });

  it("solo cierra quien abrió la sesión o un administrador", async () => {
    await as(account(5));
    await expect(command("close", {})).rejects.toThrow(/Solo quien abrió/);
    await as(admin);
    k = await command("close", {});
    expect(k.status).toBe("closed");
    expect(
      (
        await db.query(
          "select count(*) n from public.live_sessions where status='active'",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    // A closed session frees the league for the next day.
    await as(account(1));
    k = undefined as never;
    k = await command("join", { players: [player(1)] });
    expect(k.revision).toBe(1);
    expect(k.state.queue.map((w) => w.id)).toEqual([player(1)]);
  });

  it("el marcador en vivo se comparte y acaba en la partida guardada", async () => {
    await as(account(1));
    k = await command("join", { players: [player(2), player(3), player(4)] });
    k = await command("start", {
      lineup: {
        blue: { defender: player(1), forward: player(2) },
        red: { defender: player(3), forward: player(4) },
      },
    });
    expect(k.state.goals).toEqual({ blue: 0, red: 0 });
    k = await command("goal", { team: "blue", delta: 1 });
    k = await command("goal", { team: "blue", delta: 1 });
    k = await command("goal", { team: "red", delta: 1 });
    expect(k.state.goals).toEqual({ blue: 2, red: 1 });
    k = await command("goal", { team: "red", delta: -1 });
    k = await command("goal", { team: "red", delta: -1 });
    expect(k.state.goals.red).toBe(0);
    await expect(command("result", { winner: "red" })).rejects.toThrow(
      /no coincide/,
    );
    k = await command("result", { winner: "blue" });
    // The board becomes the stored score and the next match starts at zero.
    expect(k.state.goals).toEqual({ blue: 0, red: 0 });
    const saved = await db.query<{ blue_score: number; red_score: number }>(
      "select blue_score,red_score from public.matches order by created_at desc limit 1",
    );
    expect(saved.rows[0]).toEqual({ blue_score: 2, red_score: 0 });
  });

  it("quien no ha jugado adelanta en la cola a quien ya jugó", async () => {
    // La pista viene de la prueba anterior: los cuatro llevan un partido.
    await as(account(1));
    expect(k.state.queue).toHaveLength(0);
    // Ficha un quinto, juega una partida y uno de los perdedores se queda esperando.
    k = await command("join", { players: [player(5)] });
    k = await command("result", { winner: "blue" });
    const veteran = k.state.queue[0].id;
    expect(k.state.played[veteran]).toBeGreaterThan(0);
    // Llega uno que no ha jugado nada y se coloca por delante del veterano.
    k = await command("join", { players: [player(6)] });
    expect(k.state.queue.map((w) => w.id)).toEqual([player(6), veteran]);
    // Desficharse y volver no borra los partidos ya jugados.
    k = await command("leave", { player: veteran });
    k = await command("join", { players: [veteran] });
    expect(k.state.played[veteran]).toBeGreaterThan(0);
    expect(k.state.queue.map((w) => w.id)).toEqual([player(6), veteran]);
    // Y es el recién llegado quien entra en la siguiente rotación.
    k = await command("result", { winner: "blue" });
    const court = k.state.court!;
    expect([court.red.defender.id, court.red.forward.id]).toContain(player(6));
  });

  it("un nuevo fichaje impide deshacer sobre una cola antigua", async () => {
    const waiting = k.state.queue[0].id;
    k = await command("leave", { player: waiting });
    expect(k.last_match).toBeNull();
    k = await command("result", { winner: "blue" });
    expect(k.last_match).not.toBeNull();
    k = await command("join", { players: [waiting] });
    const currentQueue = k.state.queue;
    expect(k.last_match).toBeNull();
    await expect(command("undo", {})).rejects.toThrow(/No hay resultado/);
    expect(k.state.queue).toEqual(currentQueue);
  });
});
