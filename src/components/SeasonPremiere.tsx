import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Play,
  ShoppingBag,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "../data/supabase";
import { mmrStandings } from "../domain/mmr-standings";
import { rankablePlayers } from "../domain/standings-players";
import { activeLeague, competitionMmr } from "../domain/competitions";
import { characterFor } from "../domain/characters";
import type { Snapshot } from "../domain/types";
import type { Honours } from "../domain/coins";
import { CharacterOutfit } from "./CharacterOutfit";
import { preloadCharacter } from "./PlayerCharacter";
import { Avatar, Modal } from "./ui";
import "../premiere.css";
const titles = [
  "La pista",
  "El podio",
  "Tu temporada",
  "El reinicio",
  "El equipo",
  "Lo que viene",
];
const times = [5, 8, 7, 8, 15, 8];
const recapVersion = 2;
export function SeasonPremiere({
  data,
  user,
  honours,
  onShop,
}: {
  data: Snapshot;
  user: string;
  honours: Honours[] | undefined;
  onShop: () => void;
}) {
  const old = useMemo(
    () =>
      data.seasons
        .filter((s) => s.status === "closed" && s.competition_kind !== "cup")
        .sort((a, b) =>
          (b.ends_at ?? b.starts_at).localeCompare(a.ends_at ?? a.starts_at),
        )[0],
    [data.seasons],
  );
  const current = activeLeague(data),
    me = data.players.find((p) => p.account_id === user);
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [sound, setSound] = useState(false),
    [progress, setProgress] = useState(0),
    [chosen, setChosen] = useState<number | null>(null);
  const clock = useRef({ step: 0, elapsed: 0 }),
    audio = useRef<AudioContext | null>(null);
  const story = useMemo(() => {
    const matches = data.matches.filter(
        (m) => m.season_id === old?.id && m.status === "valid",
      ),
      mine = matches.filter((m) =>
        m.participants.some((p) => p.player_id === me?.id),
      );
    const awards = honours?.find((h) => h.season_id === old?.id)?.awards ?? [];
    const podium = [
      "Campeón de liga",
      "Subcampeón de liga",
      "Tercer puesto",
    ].flatMap((title) => awards.filter((a) => a.title === title));
    const previousMmr = old
      ? mmrStandings(
          competitionMmr(data, old),
          rankablePlayers(data.players),
        ).slice(0, 3)
      : [];
    return {
      matches,
      mine,
      awards,
      podium,
      previousMmr,
      wins: mine.filter((m) =>
        m.participants.some(
          (p) => p.player_id === me?.id && p.team === m.winner,
        ),
      ).length,
      roster: rankablePlayers(data.players).filter((p) => p.avatar_url),
      personal: awards.filter((a) => a.players.some((p) => p.id === me?.id)),
    };
  }, [data, old?.id, me?.id, honours]);
  const cast =
      chosen ??
      Math.min(
        story.roster.length - 1,
        Math.floor(progress * story.roster.length),
      ),
    featured = story.roster[Math.max(0, cast)];
  useEffect(() => {
    let alive = true;
    if (!old || !current?.rating_epoch || !supabase || !user) return;
    void supabase
      .from("season_recap_seen")
      .select("version")
      .eq("user_id", user)
      .eq("season_id", old.id)
      .eq("version", recapVersion)
      .then((r) => {
        if (alive && !r.error && !r.data?.length) setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, [old?.id, current?.id, user]);
  useEffect(() => {
    if (clock.current.step !== step) {
      clock.current = { step, elapsed: 0 };
      setProgress(0);
      setChosen(null);
    }
    if (!open || !playing || step === 5) return;
    let last = performance.now();
    const duration = times[step] * 1000;
    const timer = setInterval(() => {
      const now = performance.now();
      if (document.hidden) {
        setPlaying(false);
        return;
      }
      clock.current.elapsed += now - last;
      last = now;
      const fraction = Math.min(1, clock.current.elapsed / duration);
      setProgress(fraction);
      if (fraction >= 1) {
        clearInterval(timer);
        setStep((s) => Math.min(5, s + 1));
      }
    }, 100);
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open, playing, step]);
  useEffect(() => {
    if (!open) return;
    const ids =
      step === 1
        ? story.podium.flatMap((a) => a.players.map((p) => p.id))
        : step === 4
          ? story.roster
              .slice(Math.max(0, cast), Math.max(0, cast) + 3)
              .map((p) => p.id)
          : [me?.id];
    for (const id of ids) {
      const p = data.players.find((p) => p.id === id),
        asset = characterFor(p);
      if (asset) void preloadCharacter(asset).catch(() => {});
    }
  }, [open, step, cast, story.podium, story.roster, me?.id, data.players]);
  useEffect(() => {
    if (!open || !sound || !audio.current) return;
    const ctx = audio.current,
      t = ctx.currentTime;
    [196, 246.94, 293.66, 392].forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.017, t + 0.12 + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.5);
    });
  }, [step, sound, open]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function dismiss() {
    setOpen(false);
    if (supabase && old && user) {
      const r = await supabase
        .from("season_recap_seen")
        .insert({ user_id: user, season_id: old.id, version: recapVersion });
      if (r.error && r.error.code !== "23505")
        console.warn(
          "El resumen seguirá disponible al volver a abrir la aplicación.",
        );
    }
  }
  function restart() {
    clock.current = { step: 0, elapsed: 0 };
    setStep(0);
    setProgress(0);
    setChosen(null);
    setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    setOpen(true);
  }
  function move(next: number) {
    setStep(Math.max(0, Math.min(5, next)));
  }
  if (!old || !current?.rating_epoch || !me) return null;
  const outfit = (id: string) => data.loadouts?.[id] ?? [];
  return (
    <>
      <button className="text-button premiere-replay" onClick={restart}>
        <Play size={12} /> Ver cierre e intro de temporada ↗
      </button>
      {open && (
        <Modal title="Nueva temporada · FutABLE" onClose={() => void dismiss()}>
          <div
            className="season-premiere"
            data-playing={playing}
            data-scene={step}
          >
            <div className="premiere-atmosphere" aria-hidden="true">
              <div className="premiere-beam one" />
              <div className="premiere-beam two" />
              <div className="premiere-horizon" />
              <svg
                className="premiere-field"
                viewBox="0 0 1200 400"
                preserveAspectRatio="none"
              >
                <path d="M90 350L350 40H850L1110 350ZM600 40V350M260 148H940M170 255H1030" />
                <ellipse cx="600" cy="180" rx="106" ry="46" />
              </svg>
              <div className="premiere-grain" />
            </div>
            <header className="premiere-topbar">
              <div className="premiere-wordmark">
                Fut<span>ABLE</span>
                <small>LA LIGA DE LA OFICINA</small>
              </div>
              <span className="premiere-season-tag">
                {step < 3 ? old.name : "NUEVA TEMPORADA"}
              </span>
              <button className="premiere-skip" onClick={() => void dismiss()}>
                Saltar
              </button>
            </header>
            <div className="premiere-viewport">
              <section
                key={step}
                className={`premiere-scene scene-${step}`}
                aria-label={titles[step]}
              >
                {step === 0 && (
                  <div className="premiere-opening">
                    <span className="premiere-overline">
                      ESTO ES LO QUE HABÉIS CONSTRUIDO
                    </span>
                    <h2>
                      <span>La pista</span>
                      <em>es vuestra.</em>
                    </h2>
                    <p>
                      Una mesa. Muchos piques.
                      <br />
                      Una temporada que ya es historia.
                    </p>
                    <div className="premiere-stat-strip">
                      <div>
                        <b>{story.matches.length}</b>
                        <span>PARTIDAS</span>
                      </div>
                      <div>
                        <b>
                          {
                            new Set(
                              story.matches.flatMap((m) =>
                                m.participants.map((p) => p.player_id),
                              ),
                            ).size
                          }
                        </b>
                        <span>JUGADORES</span>
                      </div>
                      <div>
                        <b>
                          {story.matches.reduce(
                            (n, m) =>
                              n + (m.red_score ?? 0) + (m.blue_score ?? 0),
                            0,
                          )}
                        </b>
                        <span>GOLES REGISTRADOS</span>
                      </div>
                    </div>
                    <span className="premiere-opening-index" aria-hidden="true">
                      01
                    </span>
                  </div>
                )}
                {step === 1 && (
                  <>
                    <div className="premiere-scene-heading">
                      <span className="premiere-overline">
                        <Trophy size={13} /> EL HONOR SE QUEDA
                      </span>
                      <h2>
                        Vuestro <em>podio.</em>
                      </h2>
                      <p>
                        Los campeones de {old.name}. Según sus reglas
                        originales.
                      </p>
                    </div>
                    <div className="premiere-podium">
                      {story.podium.map((a, i) => {
                        const p = data.players.find(
                          (p) => p.id === a.players[0]?.id,
                        );
                        return (
                          <article
                            key={a.title}
                            data-rank={i + 1}
                            style={
                              {
                                "--entry":
                                  i === 0 ? ".38s" : i === 1 ? ".1s" : ".65s",
                              } as CSSProperties
                            }
                          >
                            <div className="premiere-podium-figure">
                              {p && (
                                <CharacterOutfit
                                  player={p}
                                  items={outfit(p.id)}
                                  mood="victory"
                                  animate={playing}
                                />
                              )}
                            </div>
                            <div className="premiere-plinth">
                              <span>
                                {i === 0 ? (
                                  <Trophy size={24} />
                                ) : (
                                  String(i + 1).padStart(2, "0")
                                )}
                              </span>
                              <b>{a.players.map((p) => p.name).join(" + ")}</b>
                              <small>{a.title}</small>
                            </div>
                          </article>
                        );
                      })}
                      {!story.podium.length && (
                        <p>Los resultados y premios están en Palmarés.</p>
                      )}
                    </div>
                  </>
                )}
                {step === 2 && (
                  <div className="premiere-personal">
                    <div className="premiere-personal-figure">
                      <span
                        className="premiere-player-outline"
                        aria-hidden="true"
                      >
                        MVP?
                      </span>
                      <CharacterOutfit
                        player={me}
                        items={outfit(me.id)}
                        mood="victory"
                        animate={playing}
                      />
                      <div className="premiere-player-ground" />
                    </div>
                    <div className="premiere-personal-copy">
                      <span className="premiere-overline">
                        TU HUELLA EN LA LIGA
                      </span>
                      <h2>
                        Bien jugado,<em>{me.name}.</em>
                      </h2>
                      <div className="premiere-personal-stats">
                        <div>
                          <b>{story.mine.length}</b>
                          <span>PARTIDAS</span>
                        </div>
                        <div>
                          <b>{story.wins}</b>
                          <span>VICTORIAS</span>
                        </div>
                        <div>
                          <b>{story.personal.length}</b>
                          <span>PREMIOS</span>
                        </div>
                      </div>
                      <div className="premiere-personal-awards">
                        {story.personal.map((a) => (
                          <span key={a.title}>
                            <Trophy size={13} />
                            {a.title}
                          </span>
                        ))}
                      </div>
                      <p>
                        Tu historia y tu vitrina se conservan.
                        <br />
                        Ahora toca escribir lo siguiente.
                      </p>
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="premiere-reset">
                    <span className="premiere-overline">
                      LA PRÓXIMA TEMPORADA SE GANA EN LA PISTA
                    </span>
                    <h2>
                      Todos partimos<em>de 1000.</em>
                    </h2>
                    <p>
                      El MMR se reinicia. Cada rival cuenta. Cada victoria
                      también.
                    </p>
                    <div
                      className="premiere-mmr-podium"
                      aria-label="Podio MMR anterior y reinicio"
                    >
                      {story.previousMmr.map((r, i) => (
                        <article
                          key={r.player.id}
                          style={
                            { "--entry": `${i * 0.16 + 0.2}s` } as CSSProperties
                          }
                        >
                          <span className="premiere-mmr-rank">0{i + 1}</span>
                          <Avatar player={r.player} />
                          <b>{r.player.name}</b>
                          <span className="premiere-old-mmr">
                            {Math.round(r.internal)}
                          </span>
                          <ArrowRight size={16} />
                          <strong>
                            1000<small>MMR</small>
                          </strong>
                        </article>
                      ))}
                    </div>
                    <p className="premiere-rule-caption">
                      Referencia del MMR anterior → nuevo punto de partida.
                      <br />
                      Liga: clasificación por MMR tras jugar 3 días distintos.
                    </p>
                  </div>
                )}
                {step === 4 && (
                  <>
                    <div className="premiere-scene-heading cast-heading">
                      <span className="premiere-overline">
                        EL MISMO EQUIPO. OTRA HISTORIA.
                      </span>
                      <h2>
                        Todo por <em>jugar.</em>
                      </h2>
                    </div>
                    <div className="premiere-cast-stage">
                      {[-1, 0, 1].map((offset) => {
                        if (
                          !featured ||
                          (story.roster.length < 2 && offset !== 0)
                        )
                          return null;
                        const p =
                          story.roster[
                            (Math.max(0, cast) + offset + story.roster.length) %
                              story.roster.length
                          ];
                        return (
                          <div
                            className={`premiere-cast-player ${offset === 0 ? "lead" : offset < 0 ? "left" : "right"}`}
                            key={`${offset}:${p.id}`}
                          >
                            <CharacterOutfit
                              player={p}
                              items={outfit(p.id)}
                              mood="idle"
                              animate={playing}
                            />
                          </div>
                        );
                      })}
                      <div className="premiere-cast-ground" />
                      <div className="premiere-cast-name" key={featured?.id}>
                        <span>LISTO PARA LA NUEVA TEMPORADA</span>
                        <b>{featured?.name ?? "Tu liga"}</b>
                        <small>1000 MMR · Un nuevo comienzo</small>
                      </div>
                    </div>
                    <div
                      className="premiere-roster"
                      aria-label="Ver personajes de la liga"
                    >
                      {story.roster.map((p, i) => (
                        <button
                          key={p.id}
                          title={p.name}
                          aria-label={`Ver personaje de ${p.name}`}
                          aria-pressed={i === cast}
                          onClick={() => {
                            setChosen(i);
                            setPlaying(false);
                          }}
                        >
                          <Avatar player={p} size="small" />
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {step === 5 && (
                  <div className="premiere-finale">
                    <span className="premiere-overline">
                      TEMPORADA 2 / YA EN JUEGO
                    </span>
                    <h2>
                      Vuelve el <em>pique.</em>
                    </h2>
                    <p>Tu liga. Tu equipo. Tu próxima historia.</p>
                    <div className="premiere-feature-cards">
                      <article>
                        <Swords />
                        <span>01 / COMPITE</span>
                        <h3>Liga Mediodía</h3>
                        <p>Partidas rápidas. MMR propio. Todos en 1000.</p>
                      </article>
                      <article>
                        <Trophy />
                        <span>02 / CONQUISTA</span>
                        <h3>Copa Afterwork</h3>
                        <p>
                          Final propia y tenis opcional. Otro trofeo en juego.
                        </p>
                      </article>
                      <article>
                        <ShoppingBag />
                        <span>03 / DALE TU FIRMA</span>
                        <h3>Tu vestuario</h3>
                        <p>Gana coins. Encuentra tu estilo. Sal a la pista.</p>
                      </article>
                    </div>
                    <div className="premiere-final-actions">
                      <button
                        className="premiere-enter"
                        onClick={() => void dismiss()}
                      >
                        Entrar en la nueva temporada <ArrowRight size={17} />
                      </button>
                      <button
                        className="premiere-shop-link"
                        onClick={() => {
                          void dismiss();
                          onShop();
                        }}
                      >
                        Ir al vestuario <ShoppingBag size={15} />
                      </button>
                    </div>
                    <span className="premiere-saved">
                      <Check size={13} /> Tu historia anterior sigue en Palmarés
                    </span>
                  </div>
                )}
              </section>
            </div>
            <footer className="premiere-bottom">
              <div
                className="premiere-progress"
                aria-label="Escenas de la introducción"
              >
                {titles.map((name, i) => (
                  <button
                    key={name}
                    onClick={() => move(i)}
                    aria-label={`Ir a escena ${i + 1}: ${name}`}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <span
                      style={{
                        transform: `scaleX(${i < step ? 1 : i === step ? (step === 5 ? 1 : progress) : 0})`,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="premiere-controls">
                <span className="premiere-scene-index">
                  0{step + 1}
                  <small>/ 06</small> <b>{titles[step]}</b>
                </span>
                <div>
                  <button
                    disabled={step === 0}
                    onClick={() => move(step - 1)}
                    aria-label="Escena anterior"
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <button
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "Pausar" : "Animar"}
                    aria-pressed={playing}
                  >
                    {playing ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                  <button
                    disabled={step === 5}
                    onClick={() => move(step + 1)}
                    aria-label="Escena siguiente"
                  >
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="premiere-audio"
                    aria-label={`Sonido: ${sound ? "sí" : "no"}`}
                    aria-pressed={sound}
                    onClick={() => {
                      if (!audio.current) audio.current = new AudioContext();
                      void audio.current.resume();
                      setSound((s) => !s);
                    }}
                  >
                    {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  </button>
                </div>
              </div>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
