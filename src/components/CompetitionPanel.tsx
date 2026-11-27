import { rankablePlayers } from "../domain/standings-players";
import { useState } from "react";
import { supabase } from "../data/supabase";
import { activeLeague, competitionMmr, isCup } from "../domain/competitions";
import { mmrStandings } from "../domain/mmr-standings";
import type { Season, Snapshot } from "../domain/types";
import type { LiveSession } from "../domain/live";
import { Modal } from "./ui";
import "../competition.css";
export function CompetitionPanel({
  data,
  selected,
  session,
  onSelect,
  refresh,
  demo,
}: {
  data: Snapshot;
  selected?: Season;
  session: LiveSession | null;
  onSelect: (id: string) => void;
  refresh: () => Promise<void>;
  demo: boolean;
}) {
  const [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [target, setTarget] = useState(6),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const league = activeLeague(data),
    cups = data.seasons.filter((s) => isCup(s) && s.status === "active");
  async function command(action: string, input: object) {
    if (demo) {
      setError("La demostración no crea copas reales.");
      return;
    }
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("competition_command", {
        p_league: data.league.id,
        p_action: action,
        p_input: { ...input, operation_id: crypto.randomUUID() },
      });
      if (r.error) throw r.error;
      await refresh();
      if (action === "cup.create") onSelect(r.data as string);
      setCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const general = league
    ? mmrStandings(
        competitionMmr(data, league, true),
        rankablePlayers(data.players),
      )
    : [];
  return (
    <section className="competition-panel">
      <div className="competition-actions">
        <strong>Competición</strong>
        {league && (
          <button
            className={selected?.id === league.id ? "primary" : "secondary"}
            onClick={() => onSelect(league.id)}
          >
            Liga Mediodía
          </button>
        )}
        {cups.map((c) => (
          <button
            key={c.id}
            className={selected?.id === c.id ? "primary" : "secondary"}
            onClick={() => onSelect(c.id)}
          >
            {c.name}
          </button>
        ))}
        {data.role === "admin" && (
          <button className="text-button" onClick={() => setCreate(true)}>
            + Crear Copa Afterwork
          </button>
        )}
      </div>
      <p>
        {isCup(selected)
          ? "Copa independiente · tenis opcional · sus resultados no cambian el MMR de Liga."
          : "Liga Mediodía · MMR reiniciado a 1000 · clasificado tras 3 días distintos · sin descuento por volumen."}
      </p>
      {session && (
        <small>
          Mesa en {data.seasons.find((s) => s.id === session.season_id)?.name}.
          El filtro de historial no cambia la sesión en juego.
        </small>
      )}
      {selected?.cup_result && (
        <div className="competition-winners">
          <b>
            Final ganada por{" "}
            {selected.cup_result.players
              .map(
                (id) =>
                  data.players.find((p) => p.id === id)?.name ?? "Jugador",
              )
              .join(" + ")}
          </b>
          {selected.status === "active" && data.role === "admin" && (
            <button
              disabled={busy}
              className="primary"
              onClick={() => void command("cup.close", { id: selected.id })}
            >
              Cerrar Copa y publicar campeones
            </button>
          )}
        </div>
      )}
      {isCup(selected) &&
        selected?.status === "active" &&
        !selected.cup_result &&
        data.role === "admin" && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "¿Cerrar esta Copa sin título? Sus resultados se conservarán.",
                )
              )
                void command("cup.cancel", { id: selected.id });
            }}
          >
            Cerrar Copa sin título
          </button>
        )}
      <details>
        <summary>MMR general · referencia para cuotas y nivel</summary>
        <p>
          Comparte el reinicio a 1000. Incluye Liga y Copas; el podio de Liga
          usa su propio MMR.
        </p>
        <ol>
          {general.map((r) => (
            <li key={r.player.id}>
              {r.player.name}
              <b>{Math.round(r.internal)}</b>
            </li>
          ))}
        </ol>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {create && (
        <Modal title="Crear Copa Afterwork" onClose={() => setCreate(false)}>
          <p className="rule-note">
            Evento independiente con coins y trofeo propios. El organizador
            podrá marcar su final; el tenis es opcional.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void command("cup.create", { name: name.trim(), target });
            }}
          >
            <label>
              Nombre de la Copa
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Afterwork · viernes"
              />
            </label>
            <label>
              Goles por partida
              <select
                value={target}
                onChange={(e) => setTarget(+e.target.value)}
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} goles
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || !name.trim()} className="primary">
              Crear Copa
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
