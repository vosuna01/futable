import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  LogOut,
  Maximize,
  Minus,
  Play,
  Plus,
  Radio,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import type { useLiveSession } from "../data/useLiveSession";
import {
  goalsBy,
  liveError,
  posts,
  queuePairs,
  type LiveState,
} from "../domain/live";
import type { Player, Position, Snapshot, Team } from "../domain/types";
import { teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";
import { StartEditor } from "./LiveMatch";

const postNames = { defender: "Defensa", forward: "Delantero" } as const;
const shortPost = { defender: "DEF", forward: "DEL" } as const;
/** Madrid on the left and Barça on the right, as everywhere else. */
const shown = ["red", "blue"] as const;

/**
 * Wall tablet for the live match: big targets meant to be hit from a step away.
 * Every write is the same `live_session_command` the phone view and the
 * scoreboard firmware use, so all three stay in step.
 */
export function LiveTablet({
  live,
  data,
  demo,
  user,
  online,
  onExit,
}: {
  live: ReturnType<typeof useLiveSession>;
  data: Snapshot;
  demo: boolean;
  user: string;
  online: boolean;
  onExit: () => void;
}) {
  const { session } = live;
  const state: LiveState | null = session?.state ?? null;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<Team | null>(null),
    [starting, setStarting] = useState(false),
    [adding, setAdding] = useState(false);
  const lock = useRef(false),
    attempt = useRef<{ key: string; id: string } | null>(null);
  const named = (id: string) => data.players.find((p) => p.id === id);
  const activeSeason = data.seasons.find((s) => s.status === "active");
  const sameSeason = !session || session.season_id === activeSeason?.id;
  const me = demo
    ? data.players[0]
    : data.players.find((p) => p.account_id && p.account_id === user);
  const signedUp =
    !!me &&
    !!state &&
    (state.queue.some((w) => w.id === me.id) ||
      (!!state.court &&
        Object.values(state.court).some(
          (side) => side.defender.id === me.id || side.forward.id === me.id,
        )));
  const canRun =
    (data.role === "admin" || data.role === "scoreboard" || signedUp) &&
    sameSeason;
  const invalid = state ? liveError(state, data.players) : null;
  const scored = state ? goalsBy(state) : {};
  // Before migration 008 the server keeps only the board, not the scorer.
  const scorersPending =
    !demo && !!state?.court && !Array.isArray(state.goal_log);
  const off = !online || busy || !canRun;

  // A wall screen must not dim mid-match.
  useEffect(() => {
    let lockScreen: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<typeof lockScreen> };
        };
        if (document.visibilityState === "visible" && nav.wakeLock)
          lockScreen = await nav.wakeLock.request("screen");
      } catch {
        // Not every browser allows it; the tablet's own settings still apply.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lockScreen?.release().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run = async (
    action: string,
    fields: Parameters<typeof live.command>[1],
    done?: string,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify({ action, fields });
    if (!attempt.current || attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      await live.command(action, fields, attempt.current.id);
      attempt.current = null;
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const fullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const court = state?.court ?? null;
  const pairs = state ? queuePairs(state.queue) : [];
  const onCourt = court
    ? shown.flatMap((t) => posts.map((p) => court[t][p].id))
    : [];
  const eligible = data.players.filter(
    (p) =>
      p.active &&
      !onCourt.includes(p.id) &&
      !(state?.queue ?? []).some((w) => w.id === p.id),
  );
  /** Flips who of a waiting pair defends: the first one's choice decides. */
  const flipPair = (pair: (typeof pairs)[number]) => {
    const first = state!.queue.find(
      (w) => w.id === pair.defender?.id || w.id === pair.forward?.id,
    )!;
    const now: Position =
      pair.defender?.id === first.id ? "defender" : "forward";
    void run(
      "prefer",
      { player: first.id, post: now === "defender" ? "forward" : "defender" },
      "Puestos de la pareja cambiados.",
    );
  };

  return (
    <div className="tablet" aria-label="Marcador de pared">
      <header className="tablet-bar">
        <span className="tablet-title">
          <Radio size={22} /> FutABLE · En directo
        </span>
        <span className={`connection ${online ? "" : "offline"}`}>
          <i />
          {demo ? "Demostración" : online ? "Conectado" : "Sin conexión"}
        </span>
        <button
          className="tablet-icon"
          onClick={fullScreen}
          aria-label="Pantalla completa"
        >
          <Maximize size={22} />
        </button>
        <button
          className="tablet-icon"
          onClick={onExit}
          aria-label="Salir del modo tablet"
        >
          <LogOut size={22} />
        </button>
      </header>

      {(error || live.error) && (
        <div role="alert" className="tablet-alert">
          {error || live.error}
          <button onClick={() => void live.refresh()}>Actualizar</button>
        </div>
      )}
      {notice && (
        <p role="status" className="tablet-notice">
          {notice}
        </p>
      )}
      {invalid && <p className="tablet-alert">{invalid}</p>}
      {!sameSeason && (
        <p className="tablet-alert">
          La sesión abierta es de otra temporada. Ciérrala desde el móvil.
        </p>
      )}
      {!canRun && session && sameSeason && (
        <p className="tablet-alert">
          Esta cuenta solo puede mirar. Inicia sesión con la cuenta de la tablet
          o con la de alguien fichado.
        </p>
      )}

      {live.loading ? (
        <p className="tablet-empty">Buscando la sesión…</p>
      ) : !session || !state ? (
        <div className="tablet-empty">
          <h1>No hay partida en directo.</h1>
          <p>Apunta al primero para abrir la sesión del día.</p>
          <button
            className="tablet-start"
            disabled={busy || !online || !activeSeason || !eligible.length}
            onClick={() => setAdding(true)}
          >
            <UserPlus size={26} /> Apuntar
          </button>
        </div>
      ) : (
        <>
          {court ? (
            <main className="tablet-court">
              {shown.map((team) => (
                <section
                  key={team}
                  className={`tablet-team ${team}`}
                  aria-label={teamNames[team]}
                >
                  <div className="tablet-team-head">
                    <h2>{teamNames[team]}</h2>
                    <strong
                      className="tablet-score"
                      aria-label={`Goles ${teamNames[team]}`}
                    >
                      {state.goals[team]}
                    </strong>
                  </div>
                  {posts.map((post) => {
                    const id = court[team][post].id;
                    const player = named(id);
                    return (
                      <div key={post} className="tablet-player">
                        <button
                          className="tablet-scorer"
                          disabled={off}
                          aria-label={`Gol de ${player?.name || "jugador"}`}
                          onClick={() =>
                            void run("goal", { team, delta: 1, player: id })
                          }
                        >
                          <Avatar
                            player={player || { name: "?", avatar_url: null }}
                          />
                          <span>
                            <small>{postNames[post]}</small>
                            <strong>{player?.name || "Libre"}</strong>
                          </span>
                          <b className="tablet-tally">
                            {scored[id] ? `⚽ ${scored[id]}` : "+ gol"}
                          </b>
                        </button>
                        <button
                          className="tablet-minus"
                          disabled={off || !scored[id]}
                          aria-label={`Quitar gol de ${player?.name || "jugador"}`}
                          onClick={() =>
                            void run("goal", { team, delta: -1, player: id })
                          }
                        >
                          <Minus size={22} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    className="tablet-swap"
                    disabled={off}
                    onClick={() =>
                      void run(
                        "assign",
                        {
                          team,
                          defender: court[team].forward.id,
                          forward: court[team].defender.id,
                        },
                        `${teamNames[team]}: puestos intercambiados.`,
                      )
                    }
                  >
                    <ArrowLeftRight size={22} /> Intercambiar defensa y
                    delantero
                  </button>
                  <div className="tablet-goal-row">
                    <button
                      className={`tablet-goal ${team}`}
                      disabled={off}
                      onClick={() => void run("goal", { team, delta: 1 })}
                    >
                      <Plus size={26} /> Gol {teamNames[team]}
                    </button>
                    <button
                      className="tablet-minus"
                      disabled={off || !state.goals[team]}
                      aria-label={`Anular gol de ${teamNames[team]}`}
                      onClick={() => void run("goal", { team, delta: -1 })}
                    >
                      <Minus size={26} />
                    </button>
                  </div>
                  <button
                    className={`tablet-win ${team}`}
                    disabled={off || !!invalid}
                    onClick={() => setConfirm(team)}
                  >
                    <CheckCircle2 size={26} /> Gana {teamNames[team]}
                  </button>
                </section>
              ))}
            </main>
          ) : (
            <div className="tablet-empty">
              <h1>
                {state.queue.length >= 4
                  ? "Ya sois cuatro."
                  : `Faltan ${4 - state.queue.length} para empezar.`}
              </h1>
              <button
                className="tablet-start"
                disabled={off || state.queue.length < 4}
                onClick={() => setStarting(true)}
              >
                <Play size={26} /> Empezar partida
              </button>
            </div>
          )}

          {scorersPending && (
            <p className="tablet-hint">
              Los goles por jugador se guardarán cuando se aplique la migración
              008. Mientras, cuentan para el equipo.
            </p>
          )}

          <section className="tablet-queue" aria-label="Cola">
            <div className="tablet-queue-head">
              <h2>Cola · {state.queue.length} esperando</h2>
              {session.last_match && canRun && (
                <button
                  className="tablet-secondary"
                  disabled={busy || !online}
                  onClick={() =>
                    void run(
                      "undo",
                      {},
                      "Resultado anulado. La cola vuelve a como estaba.",
                    )
                  }
                >
                  <Undo2 size={20} /> Deshacer último resultado
                </button>
              )}
              <button
                className="tablet-secondary"
                disabled={busy || !online || !eligible.length}
                onClick={() => setAdding(true)}
              >
                <UserPlus size={20} /> Apuntar
              </button>
            </div>
            {pairs.length ? (
              <ol className="tablet-pairs">
                {pairs.map((pair, i) => (
                  <li
                    key={(pair.defender?.id || "") + (pair.forward?.id || "")}
                  >
                    <span className="tablet-turn">
                      {i === 0 ? "Entran" : `${i + 1}ª`}
                    </span>
                    {(["defender", "forward"] as const).map((post) => {
                      const w = pair[post];
                      return (
                        <span key={post} className="tablet-waiting">
                          <small>{shortPost[post]}</small>
                          {w ? (
                            <>
                              <strong>{named(w.id)?.name || "?"}</strong>
                              <button
                                className="tablet-x"
                                aria-label={`Quitar a ${named(w.id)?.name || "jugador"} de la cola`}
                                disabled={off}
                                onClick={() =>
                                  void run("leave", { player: w.id })
                                }
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <em>un perdedor</em>
                          )}
                        </span>
                      );
                    })}
                    <button
                      className="tablet-pair-swap"
                      disabled={off}
                      aria-label={`Cambiar puestos de la pareja ${i + 1}`}
                      onClick={() => flipPair(pair)}
                    >
                      <ArrowLeftRight size={20} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tablet-muted">
                Nadie espera. Los perdedores vuelven a entrar.
              </p>
            )}
          </section>
        </>
      )}

      {confirm && state?.court && (
        <Modal
          title={`¿Gana ${teamNames[confirm]}?`}
          onClose={() => setConfirm(null)}
        >
          <p className="tablet-confirm-score">
            Madrid {state.goals.red} · {state.goals.blue} Barça
          </p>
          <div className="modal-actions">
            <button className="text-button" onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={busy || !online}
              onClick={() => {
                const winner = confirm;
                setConfirm(null);
                void run(
                  "result",
                  { winner },
                  `Gana ${teamNames[winner]}. Entra la siguiente pareja.`,
                );
              }}
            >
              Guardar resultado
            </button>
          </div>
        </Modal>
      )}
      {starting && state && (
        <StartEditor
          queue={state.queue}
          players={data.players}
          busy={busy}
          onClose={() => setStarting(false)}
          onStart={(lineup) => {
            setStarting(false);
            void run("start", { lineup }, "Partida en marcha.");
          }}
        />
      )}
      {adding && (
        <Modal title="Apuntar a la cola" onClose={() => setAdding(false)}>
          <ul className="live-picker">
            {eligible.map((p: Player) => (
              <li key={p.id}>
                <button
                  disabled={busy || !online}
                  onClick={() => {
                    setAdding(false);
                    void run(
                      "join",
                      { players: [p.id] },
                      `${p.name} a la cola.`,
                    );
                  }}
                >
                  <Avatar player={p} size="small" /> {p.name}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
