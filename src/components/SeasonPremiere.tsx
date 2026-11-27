import { useEffect, useRef, useState } from "react";
import { supabase } from "../data/supabase";
import { mmrStandings } from "../domain/mmr-standings";
import { rankablePlayers } from "../domain/standings-players";
import { activeLeague, competitionMmr } from "../domain/competitions";
import type { Snapshot } from "../domain/types";
import type { Honours } from "../domain/coins";
import { CharacterOutfit } from "./CharacterOutfit";
import { Modal } from "./ui";
import "../premiere.css";
const times = [5, 7, 6, 12, 8];
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
  const old = data.seasons
    .filter((s) => s.status === "closed" && s.competition_kind !== "cup")
    .sort((a, b) =>
      (b.ends_at ?? b.starts_at).localeCompare(a.ends_at ?? a.starts_at),
    )[0];
  const current = activeLeague(data),
    me = data.players.find((p) => p.account_id === user);
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [sound, setSound] = useState(false),
    [cast, setCast] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let alive = true;
    if (!old || !current?.rating_epoch || !supabase || !user) return;
    void supabase
      .from("season_recap_seen")
      .select("version")
      .eq("user_id", user)
      .eq("season_id", old.id)
      .eq("version", 1)
      .then((r) => {
        if (alive && !r.error && !r.data?.length) setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, [old?.id, current?.id, user]);
  useEffect(() => {
    if (!open || !playing || step === 4) return;
    const token = ++generation.current;
    const timer = setTimeout(() => {
      if (!document.hidden && token === generation.current)
        setStep((s) => Math.min(4, s + 1));
    }, times[step] * 1000);
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [open, playing, step]);
  useEffect(() => {
    if (!open || !playing || step !== 3) return;
    const t = setInterval(
      () =>
        setCast(
          (n) =>
            (n + 1) %
            Math.max(
              1,
              Math.ceil(
                data.players.filter((p) => p.active && p.avatar_url).length / 3,
              ),
            ),
        ),
      3000,
    );
    return () => clearInterval(t);
  }, [open, step, playing, data.players]);
  useEffect(() => {
    if (!sound || !audio.current) return;
    const ctx = audio.current,
      t = ctx.currentTime;
    [220, 330, 440].forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.025, t + 0.1 + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.2);
    });
  }, [step, sound]);
  async function dismiss() {
    setOpen(false);
    if (supabase && old && user) {
      const r = await supabase
        .from("season_recap_seen")
        .insert({ user_id: user, season_id: old.id, version: 1 });
      if (r.error && r.error.code !== "23505")
        console.warn(
          "El resumen seguirá disponible al volver a abrir la aplicación.",
        );
    }
  }
  if (!old || !current?.rating_epoch || !me) return null;
  const matches = data.matches.filter(
      (m) => m.season_id === old.id && m.status === "valid",
    ),
    mine = matches.filter((m) =>
      m.participants.some((p) => p.player_id === me.id),
    );
  const wins = mine.filter((m) =>
    m.participants.some((p) => p.player_id === me.id && p.team === m.winner),
  ).length;
  const awards = honours?.find((h) => h.season_id === old.id)?.awards ?? [];
  const previousMmr = mmrStandings(
    competitionMmr(data, old),
    rankablePlayers(data.players),
  ).slice(0, 3);
  const podium = awards.filter((a) =>
    ["Campeón de liga", "Subcampeón de liga", "Tercer puesto"].includes(
      a.title,
    ),
  );
  const roster = rankablePlayers(data.players).filter((p) => p.avatar_url),
    group = roster.slice(cast * 3, cast * 3 + 3);
  return (
    <>
      <button
        className="text-button premiere-replay"
        onClick={() => {
          setStep(0);
          setCast(0);
          setOpen(true);
        }}
      >
        Ver cierre e intro de temporada ↗
      </button>
      {open && (
        <Modal title="Nueva temporada · FutABLE" onClose={() => void dismiss()}>
          <div className="season-premiere">
            <span className="premiere-eyebrow">
              FutABLE · {step < 3 ? old.name : "NUEVA ETAPA"}
            </span>
            {step === 0 && (
              <section className="premiere-scene">
                <h2>
                  La pista
                  <br />
                  <em>es vuestra.</em>
                </h2>
                <p>Así cerramos {old.name}.</p>
                <div className="premiere-numbers">
                  <b>
                    {matches.length}
                    <small>partidas</small>
                  </b>
                  <b>
                    {
                      new Set(
                        matches.flatMap((m) =>
                          m.participants.map((p) => p.player_id),
                        ),
                      ).size
                    }
                    <small>jugadores</small>
                  </b>
                  <b>
                    {matches.reduce(
                      (s, m) => s + (m.red_score ?? 0) + (m.blue_score ?? 0),
                      0,
                    )}
                    <small>goles registrados</small>
                  </b>
                </div>
              </section>
            )}
            {step === 1 && (
              <section className="premiere-scene">
                <h2>
                  Vuestro <em>podio.</em>
                </h2>
                {podium.length ? (
                  <div className="premiere-podium">
                    {podium.map((a, i) => {
                      const player = data.players.find(
                        (p) => p.id === a.players[0]?.id,
                      );
                      return (
                        <article key={a.title}>
                          <span>{i + 1}</span>
                          <div>
                            {player && (
                              <CharacterOutfit
                                player={player}
                                mood="victory"
                                items={data.loadouts?.[player.id] ?? []}
                              />
                            )}
                          </div>
                          <b>{a.players.map((p) => p.name).join(" + ")}</b>
                          <small>{a.title}</small>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p>Los resultados y premios están en Palmarés.</p>
                )}
                <p className="premiere-fine">
                  Referencia MMR anterior:{" "}
                  {previousMmr
                    .map(
                      (r, i) =>
                        `${i + 1}. ${r.player.name} · ${Math.round(r.internal)}`,
                    )
                    .join(" / ")}
                  . Se reinicia en la nueva etapa.
                </p>
                <p className="premiere-fine">
                  Resultados de la temporada cerrada, según sus reglas
                  originales.
                </p>
              </section>
            )}
            {step === 2 && (
              <section className="premiere-scene">
                <h2>
                  Bien jugado,
                  <br />
                  <em>{me.name}.</em>
                </h2>
                <div className="premiere-personal">
                  <div>
                    <CharacterOutfit
                      player={me}
                      items={data.loadouts?.[me.id] ?? []}
                      mood="victory"
                    />
                  </div>
                  <div className="premiere-numbers">
                    <b>
                      {mine.length}
                      <small>partidas</small>
                    </b>
                    <b>
                      {wins}
                      <small>victorias</small>
                    </b>
                    <b>
                      {
                        awards.filter((a) =>
                          a.players.some((p) => p.id === me.id),
                        ).length
                      }
                      <small>premios</small>
                    </b>
                  </div>
                </div>
              </section>
            )}
            {step === 3 && (
              <section className="premiere-scene">
                <h2>
                  Todos partimos
                  <br />
                  <em>de 1000.</em>
                </h2>
                <p>El MMR se reinicia. El próximo podio se gana en la pista.</p>
                <div className="premiere-cast">
                  {group.map((player) => (
                    <article key={player.id}>
                      <div>
                        <CharacterOutfit
                          player={player}
                          items={data.loadouts?.[player.id] ?? []}
                          mood="victory"
                        />
                      </div>
                      <b>{player.name}</b>
                      <small>1000 MMR</small>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {step === 4 && (
              <section className="premiere-scene">
                <h2>
                  Tu liga.
                  <br />
                  <em>Tu estilo.</em>
                </h2>
                <ul>
                  <li>Liga Mediodía: MMR propio y partidas rápidas.</li>
                  <li>Copa Afterwork: final propia y tenis opcional.</li>
                  <li>Coins y accesorios para personalizar tu personaje.</li>
                </ul>
                <button className="primary" onClick={() => void dismiss()}>
                  Entrar en la nueva temporada
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    void dismiss();
                    onShop();
                  }}
                >
                  Ir al vestuario ↗
                </button>
              </section>
            )}
            <div className="premiere-controls">
              <span>{step + 1} / 5</span>
              <button
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                aria-label="Escena anterior"
              >
                ←
              </button>
              <button onClick={() => setPlaying((p) => !p)}>
                {playing ? "Pausar" : "Animar"}
              </button>
              <button
                disabled={step === 4}
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                aria-label="Escena siguiente"
              >
                →
              </button>
              <button
                onClick={() => {
                  if (!audio.current) {
                    const C =
                      window.AudioContext || (window as any).webkitAudioContext;
                    if (C) audio.current = new C();
                  }
                  void audio.current?.resume();
                  setSound((s) => !s);
                }}
              >
                Sonido: {sound ? "sí" : "no"}
              </button>
              <button onClick={() => void dismiss()}>Saltar</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
