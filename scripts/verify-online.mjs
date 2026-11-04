// Run ONLY against an isolated test league. No service-role key is used.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const names = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_ADMIN_EMAIL",
  "TEST_ADMIN_PASSWORD",
  "TEST_PLAYER_EMAIL",
  "TEST_PLAYER_PASSWORD",
  "TEST_LEAGUE_ID",
];
for (const key of names)
  if (!process.env[key])
    throw new Error(`Falta ${key}. Consulta docs/PRUEBAS.md.`);
const env = process.env;
const make = () =>
  createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = make(),
  player = make();
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
for (const [client, email, password] of [
  [admin, env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD],
  [player, env.TEST_PLAYER_EMAIL, env.TEST_PLAYER_PASSWORD],
]) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
let id, channel;
const league = env.TEST_LEAGUE_ID;
try {
  const snap = await rpc(admin, "league_snapshot", { p_league: league });
  const season = snap.seasons.find((s) => s.status === "active"),
    players = snap.players.filter((p) => p.active).slice(0, 4);
  assert(
    season && players.length === 4,
    "Necesitas temporada activa y cuatro jugadores de prueba.",
  );
  let signal;
  let extensionReady;
  const extension = new Promise((resolve) => (extensionReady = resolve));
  const received = new Promise((resolve) => (signal = resolve));
  channel = admin
    .channel(`test:${crypto.randomUUID()}`)
    .on("system", {}, (event) => {
      if (event.extension === "postgres_changes" && event.status === "ok")
        extensionReady();
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "matches",
        filter: `league_id=eq.${league}`,
      },
      (payload) => signal(payload),
    );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime no conecta")),
      15000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timer);
        reject(new Error("Canal Realtime rechazado"));
      }
    });
  });
  let extensionTimeout;
  await Promise.race([
    extension,
    new Promise(
      (_, reject) =>
        (extensionTimeout = setTimeout(
          () => reject(new Error("La extensión PostgreSQL no quedó lista")),
          15000,
        )),
    ),
  ]).finally(() => clearTimeout(extensionTimeout));
  const input = {
    operation_id: crypto.randomUUID(),
    season_id: season.id,
    blue_score: season.target,
    red_score: 0,
    participants: players.map((p, i) => ({
      player_id: p.id,
      team: i < 2 ? "blue" : "red",
      position: i % 2 ? "forward" : "defender",
    })),
  };
  const args = { p_league: league, p_input: input };
  const results = await Promise.all(
    Array.from({ length: 4 }, () => rpc(player, "save_match", args)),
  );
  assert.equal(new Set(results).size, 1, "Un reintento duplicó la partida");
  id = results[0];
  let timeout;
  await Promise.race([
    received,
    new Promise(
      (_, reject) =>
        (timeout = setTimeout(
          () => reject(new Error("No se recibió INSERT por Realtime")),
          15000,
        )),
    ),
  ]).finally(() => clearTimeout(timeout));
  const updated = await rpc(admin, "league_snapshot", { p_league: league });
  assert.equal(updated.matches.filter((m) => m.id === id).length, 1);
  assert.equal(updated.matches.find((m) => m.id === id).participants.length, 4);
  // Disconnect the subscriber, correct a result, reconnect, recover via authoritative query.
  await admin.removeChannel(channel);
  channel = null;
  const changed = {
    ...input,
    operation_id: crypto.randomUUID(),
    red_score: season.target > 1 ? 1 : 0,
  };
  await rpc(admin, "save_match", {
    p_league: league,
    p_input: changed,
    p_match: id,
    p_revision: 1,
    p_reason: "Verificación de integración",
  });
  channel = admin.channel(`reconnected:${crypto.randomUUID()}`).on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "matches",
      filter: `league_id=eq.${league}`,
    },
    () => {},
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("No se pudo reconectar Realtime")),
      15000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timer);
        reject(new Error("Reconexión rechazada"));
      }
    });
  });
  const recovered = await rpc(player, "league_snapshot", { p_league: league });
  assert.equal(recovered.matches.find((m) => m.id === id).revision, 2);
  const denied = await player.rpc("admin_command", {
    p_league: league,
    p_action: "match.void",
    p_data: { id, revision: 2, reason: "No autorizado" },
  });
  assert(denied.error, "El jugador no debe anular resultados");
  console.log(
    "OK: Auth, dos sesiones, RPC, concurrencia, idempotencia, RLS, Realtime y recuperación por consulta.",
  );
} finally {
  if (channel) await admin.removeChannel(channel);
  if (id) {
    const snap = await rpc(admin, "league_snapshot", { p_league: league });
    const m = snap.matches.find((m) => m.id === id);
    if (m?.status === "valid")
      await rpc(admin, "admin_command", {
        p_league: league,
        p_action: "match.void",
        p_data: {
          id,
          revision: m.revision,
          reason: "Fin de verificación de integración",
        },
      });
  }
  admin.realtime.disconnect();
  player.realtime.disconnect();
  await Promise.all([admin.auth.signOut(), player.auth.signOut()]);
}
