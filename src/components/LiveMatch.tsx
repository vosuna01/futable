import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Minus,
  Play,
  Plus,
  Radio,
  Tablet,
  Ticket,
  TrendingUp,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import type { useLiveSession } from "../data/useLiveSession";
import type { Lineup, LiveState } from "../domain/live";
import {
  liveError,
  playedBy,
  posts,
  proposedLineup,
  sides,
  type Waiting,
} from "../domain/live";
import { forecast } from "../domain/odds";
import {
  defaultRules,
  type Player,
  type Snapshot,
  type Team,
} from "../domain/types";
import { teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";

const postNames = { defender: "Defensa", forward: "Delantero" } as const;
/** Madrid on the left and Barça on the right, as on the score form. */
const shown = ["red", "blue"] as const;
/** The four posts of the starting picker, in the order they are drawn. */
const slotOrder = [
  { team: "red", post: "defender" },
  { team: "red", post: "forward" },
  { team: "blue", post: "defender" },
  { team: "blue", post: "forward" },
] as const;

function PlayerChip({
  player,
  caption,
}: {
  player: Player | undefined;
  caption?: string;
}) {
  return (
    <div className="live-chip">
      <Avatar
        player={player || { name: "Libre", avatar_url: null }}
        size="small"
      />
      <span>
        <strong>{player?.name || "Libre"}</strong>
        {caption && <small>{caption}</small>}
      </span>
    </div>
  );
}

export function LiveMatch({
  live,
  data,
  me,
  user,
  online,
  onTablet,
  betting,
}: {
  live: ReturnType<typeof useLiveSession>;
  data: Snapshot;
  me: Player | undefined;
  user: string;
  online: boolean;
  onTablet?: () => void;
  betting?: ReactNode;
}) {
  const { session } = live;
  const state: LiveState | null = session?.state ?? null;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false),
    [starting, setStarting] = useState(false),
    [closing, setClosing] = useState(false),
    [sorting, setSorting] = useState<Team | null>(null);
  const lock = useRef(false),
    attempt = useRef<{ key: string; id: string } | null>(null);
  const named = (id: string) => data.players.find((p) => p.id === id);
  const activeSeason = data.seasons.find((s) => s.status === "active");
  const sameSeason = !session || session.season_id === activeSeason?.id;
  const onCourt = state?.court
    ? sides.flatMap((t) => posts.map((p) => state.court![t][p].id))
    : [];
  const waitingAt = me
    ? (state?.queue.findIndex((w) => w.id === me.id) ?? -1)
    : -1;
  const playing = !!me && onCourt.includes(me.id);
  const signedUp = playing || waitingAt >= 0;
  const canRun =
    (signedUp || data.role === "admin" || data.role === "scoreboard") &&
    sameSeason;
  // Any member of the league may close the day (migration 011); matches stay.
  const canClose = !!session;
  const invalid = state ? liveError(state, data.players) : null;

  const odds = useMemo(
    () =>
      state?.court && activeSeason
        ? forecast(
            state,
            data.players,
            data.matches.filter((m) => m.season_id === activeSeason.id),
            activeSeason ?? defaultRules,
          )
        : null,
    [state, data.players, data.matches, activeSeason],
  );

  const run = async (
    action: string,
    fields: Parameters<typeof live.command>[1],
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const key = JSON.stringify({ action, fields });
    if (!attempt.current || attempt.current.key !== key)
      attempt.current = { key, id: crypto.randomUUID() };
    try {
      await live.command(action, fields, attempt.current.id);
      attempt.current = null;
      if (action === "start") {
        setStarting(false);
        setNotice("Partida en marcha. Que gane el mejor.");
      }
      if (action === "join") {
        setAdding(false);
        setNotice("Fichado. Ya estás en la cola.");
      }
      // The rotation dialog carries the news, so no banner is needed here.
      if (action === "result")
        setSorting(fields.winner === "blue" ? "red" : "blue");
      if (action === "assign") {
        setSorting(null);
        setNotice("Puestos repartidos.");
      }
      if (action === "undo") {
        setSorting(null);
        setNotice("Resultado anulado. La cola vuelve a como estaba.");
      }
      if (action === "close") {
        setClosing(false);
        setNotice("Sesión cerrada. Los resultados se conservan.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const canStart = !!state && !state.court && state.queue.length >= 4;
  const eligible = data.players.filter(
    (p) =>
      p.active &&
      !onCourt.includes(p.id) &&
      !(state?.queue ?? []).some((w) => w.id === p.id),
  );

  return (
    <section className="live-match" aria-label="Partida en directo">
      <div className="live-heading">
        <div>
          <span className="eyebrow">LA MÁQUINA MANDA</span>
          <h1>
            <Radio /> Partida en directo<span>.</span>
          </h1>
          <p>Fíchate, espera tu turno y entra cuando toque.</p>
          {onTablet && (
            <button className="text-button live-tablet-link" onClick={onTablet}>
              <Tablet size={16} /> Abrir modo tablet de pared
            </button>
          )}
        </div>
        {me && !signedUp && session && (
          <button
            className="primary"
            disabled={busy || !online || !activeSeason}
            onClick={() => void run("join", { players: [me.id] })}
          >
            <Ticket size={18} /> Fitxo
          </button>
        )}
      </div>

      {(error || live.error) && (
        <div role="alert" className="error">
          {error || live.error}
          <button className="text-button" onClick={() => void live.refresh()}>
            Actualizar sesión
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="live-notice">
          {notice}
        </p>
      )}
      {invalid && <p className="error">{invalid}</p>}
      {!sameSeason && (
        <p className="error">
          Esta sesión es de otra temporada. Ciérrala antes de abrir una nueva.
        </p>
      )}

      {live.loading ? (
        <p>Buscando una sesión abierta…</p>
      ) : !session ? (
        <div className="panel live-empty">
          <Radio size={44} />
          <h2>Nadie ha fichado todavía.</h2>
          <p>
            El primero en ficharse abre la sesión del día. A partir de cuatro,
            la pista arranca sola.
          </p>
          {me ? (
            <button
              className="primary"
              disabled={!online || !activeSeason || busy}
              onClick={() => void run("join", { players: [me.id] })}
            >
              <Ticket size={18} /> Fitxo
            </button>
          ) : (
            <p className="rule-note">
              Tu cuenta todavía no tiene ficha de jugador en esta liga.
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            className={`live-status ${signedUp ? "in" : "out"}`}
            role="status"
          >
            <Ticket size={19} />
            <strong>
              {playing
                ? "Estás jugando"
                : waitingAt >= 0
                  ? "Estás fichado"
                  : data.role === "admin"
                    ? "Administras la liga"
                    : "No estás fichado"}
            </strong>
            <span>
              {playing
                ? "Ahora mismo en la pista"
                : waitingAt >= 0
                  ? `${waitingAt + 1}º de la cola · ${waitingAt === 0 ? "entras en la próxima" : `${waitingAt} por delante`}`
                  : "Toca Fitxo para entrar en la cola"}
            </span>
          </div>

          {state!.court ? (
            <>
              {odds && (
                <div className="live-bet">
                  <div className="live-bet-head">
                    <TrendingUp size={17} />
                    <strong>PRONÓSTICO DE LA PISTA</strong>
                  </div>
                  <div className="live-bet-rows">
                    {shown.map((team) => (
                      <div
                        key={team}
                        className={`live-bet-row ${odds.favourite === team ? "favourite" : ""}`}
                      >
                        <span>{teamNames[team]}</span>
                        <b>{Math.round(odds[team].probability * 100)}%</b>
                        <small>
                          estimado
                        </small>
                      </div>
                    ))}
                  </div>
                  <p className="rule-note">
                    Estimación estadística. El bote de coins se reparte por separado.
                  </p>
                </div>
              )}

              {betting}
              <div className="live-teams">
                {shown.map((team) => (
                  <article key={team} className={`live-team ${team}`}>
                    <h2>{teamNames[team]}</h2>
                    <strong
                      className="live-score"
                      aria-label={`Goles ${teamNames[team]}`}
                    >
                      {state!.goals[team]}
                    </strong>
                    {posts.map((post) => (
                      <PlayerChip
                        key={post}
                        player={named(state!.court![team][post].id)}
                        caption={postNames[post]}
                      />
                    ))}
                    <button
                      className={`live-win ${team}`}
                      disabled={!online || busy || !canRun || !!invalid}
                      onClick={() => void run("result", { winner: team })}
                    >
                      <CheckCircle2 size={21} />{" "}
                      {busy ? "Guardando…" : `Gana ${teamNames[team]}`}
                    </button>
                    <div className="live-goal-row">
                      <button
                        className={`live-goal ${team}`}
                        disabled={!online || busy || !canRun}
                        onClick={() => void run("goal", { team, delta: 1 })}
                      >
                        <Plus size={17} /> Gol
                      </button>
                      <button
                        className="live-goal-undo"
                        aria-label={`Anular gol de ${teamNames[team]}`}
                        disabled={
                          !online || busy || !canRun || !state!.goals[team]
                        }
                        onClick={() => void run("goal", { team, delta: -1 })}
                      >
                        <Minus size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {canRun && session.last_match && (
                <div className="live-controls">
                  <button
                    className="secondary"
                    disabled={busy || !online}
                    onClick={() => void run("undo", {})}
                  >
                    <Undo2 size={17} /> Deshacer último resultado
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="panel live-waiting">
              <Clock size={40} />
              <h2>
                {canStart
                  ? "Ya sois cuatro."
                  : `Faltan ${4 - (state?.queue.length ?? 0)} para empezar.`}
              </h2>
              <p>
                {canStart
                  ? "Se colocan los cuatro primeros de la cola. Puedes moverlos antes de arrancar."
                  : "En cuanto haya cuatro fichados se puede montar la primera partida."}
              </p>
              <button
                className="primary"
                disabled={!canStart || busy || !online || !canRun}
                onClick={() => setStarting(true)}
              >
                <Play size={18} /> Empezar partida
              </button>
            </div>
          )}

          <section className="panel live-queue">
            <div className="live-queue-heading">
              <h2>Cola</h2>
              <span>{state!.queue.length} esperando</span>
            </div>
            {state!.queue.length ? (
              <ol>
                {state!.queue.map((w, i) => (
                  <li key={w.id}>
                    <span className="live-turn">{i + 1}</span>
                    <PlayerChip
                      player={named(w.id)}
                      caption={
                        !playedBy(state!, w.id)
                          ? "Aún no ha jugado · prioridad"
                          : state!.round - w.since > 0
                            ? `Esperando ${state!.round - w.since} ${state!.round - w.since === 1 ? "ronda" : "rondas"}`
                            : "Recién salido de la pista"
                      }
                    />
                    {(w.id === me?.id ||
                      data.role === "admin" ||
                      data.role === "scoreboard" ||
                      signedUp) && (
                      <button
                        className="icon-button"
                        aria-label={`Quitar a ${named(w.id)?.name || "jugador"} de la cola`}
                        disabled={busy || !online}
                        onClick={() => void run("leave", { player: w.id })}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Nadie espera. Los perdedores vuelven a entrar hasta que fiche
                alguien más.
              </p>
            )}
            <button
              className="secondary"
              disabled={busy || !online || !eligible.length}
              onClick={() => setAdding(true)}
            >
              <UserPlus size={17} /> Apuntar a alguien
            </button>
            <p className="rule-note">
              Quien no ha jugado todavía pasa delante. Después, los ganadores se
              quedan y los perdedores van al final; si ambos esperaron lo mismo,
              se sortea.
            </p>
          </section>

          {canClose && (
            <button
              className="text-button live-close"
              disabled={busy || !online}
              onClick={() => setClosing(true)}
            >
              Cerrar sesión del día
            </button>
          )}
        </>
      )}

      {adding && (
        <Modal title="Apuntar a alguien" onClose={() => setAdding(false)}>
          <p className="rule-note">
            Apunta a quien no lleve el móvil. Quien aún no ha jugado tiene
            prioridad.
          </p>
          <ul className="live-picker">
            {eligible.map((p) => (
              <li key={p.id}>
                <button
                  disabled={busy || !online}
                  onClick={() => void run("join", { players: [p.id] })}
                >
                  <Avatar player={p} size="small" /> {p.name}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {sorting && state?.court && (
        <Modal title="Resultado guardado" onClose={() => setSorting(null)}>
          <p className="rule-note">
            Partida guardada. Acaban de entrar en {teamNames[sorting]}: déjalo
            como está o cámbialos de puesto.
          </p>
          <div className={`live-side ${sorting}`}>
            <h3>{teamNames[sorting]}</h3>
            {posts.map((post) => (
              <div key={post} className="live-slot">
                <small>{postNames[post]}</small>
                <strong>{named(state.court![sorting][post].id)?.name}</strong>
              </div>
            ))}
          </div>
          <div className="live-sort-actions">
            <button
              className="secondary"
              disabled={busy || !online || !canRun}
              onClick={() =>
                void run("assign", {
                  team: sorting,
                  defender: state.court![sorting].forward.id,
                  forward: state.court![sorting].defender.id,
                })
              }
            >
              <ArrowLeftRight size={17} /> Intercambiar puestos
            </button>
            <button className="secondary" onClick={() => setSorting(null)}>
              Así está bien
            </button>
          </div>
          {canClose && (
            <button
              className="text-button live-close"
              disabled={busy || !online}
              onClick={() => {
                setSorting(null);
                setClosing(true);
              }}
            >
              Cerrar sesión del día
            </button>
          )}
        </Modal>
      )}

      {starting && state && (
        <StartEditor
          queue={state.queue}
          players={data.players}
          busy={busy}
          onClose={() => setStarting(false)}
          onStart={(lineup) => void run("start", { lineup })}
        />
      )}

      {closing && (
        <Modal title="Cerrar sesión" onClose={() => setClosing(false)}>
          <p>
            Se vacían la pista y la cola. Las partidas guardadas se conservan en
            la clasificación.
          </p>
          <div className="modal-actions">
            <button className="text-button" onClick={() => setClosing(false)}>
              Seguir jugando
            </button>
            <button
              className="primary"
              disabled={busy || !online}
              onClick={() => void run("close", {})}
            >
              Cerrar sesión
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function StartEditor({
  queue,
  players,
  busy,
  onClose,
  onStart,
}: {
  queue: Waiting[];
  players: Player[];
  busy: boolean;
  onClose: () => void;
  onStart: (lineup: Lineup) => void;
}) {
  // The first four waiting are proposed in arrival order, with the posts they
  // agreed while waiting; tapping two posts swaps whoever stands in them.
  const [slots, setSlots] = useState<string[]>(() => {
    const proposed = proposedLineup(queue);
    return [
      proposed.red.defender,
      proposed.red.forward,
      proposed.blue.defender,
      proposed.blue.forward,
    ];
  });
  const [picked, setPicked] = useState<number | null>(null);
  const named = (id: string) => players.find((p) => p.id === id);
  const tapSlot = (index: number) => {
    if (picked === null) return setPicked(index);
    setSlots((current) => {
      const next = [...current];
      [next[picked], next[index]] = [next[index], next[picked]];
      return next;
    });
    setPicked(null);
  };
  const ready = new Set(slots).size === 4 && slots.every(Boolean);
  return (
    <Modal title="Empezar partida" onClose={onClose}>
      <p className="rule-note">
        Propuesta por orden de llegada. Toca dos puestos para intercambiarlos.
      </p>
      <div className="live-pitch">
        {shown.map((team) => (
          <div key={team} className={`live-side ${team}`}>
            <h3>{teamNames[team]}</h3>
            {slotOrder.map((slot, index) =>
              slot.team !== team ? null : (
                <button
                  key={slot.post}
                  type="button"
                  className={`live-slot ${picked === index ? "picked" : ""}`}
                  aria-label={`${teamNames[team]} · ${postNames[slot.post]}`}
                  aria-pressed={picked === index}
                  disabled={busy}
                  onClick={() => tapSlot(index)}
                >
                  <small>{postNames[slot.post]}</small>
                  <strong>{named(slots[index])?.name || "Libre"}</strong>
                </button>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="text-button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={() =>
            onStart({
              red: { defender: slots[0], forward: slots[1] },
              blue: { defender: slots[2], forward: slots[3] },
            })
          }
        >
          Empezar
        </button>
      </div>
    </Modal>
  );
}
