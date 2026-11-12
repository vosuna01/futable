import { useState } from "react";
import { Coins, Trophy, ArrowUpRight, Radio } from "lucide-react";
import type { useCoins } from "../data/useCoins";
import {
  awardSuggestions,
  pooledReturn,
  type Award,
  type CoinSettings,
} from "../domain/coins";
import type { Snapshot, Team } from "../domain/types";
import { teamNames } from "../domain/teams";
import { Avatar, Modal } from "./ui";
type CoinsController = ReturnType<typeof useCoins>;
const amounts = new Intl.NumberFormat("es-ES");
const reasons: Record<string, string> = {
  welcome: "Bienvenida a la temporada",
  win: "Premio por victoria · ajuste",
  stake: "Apuesta registrada",
  payout: "Reparto del bote · ajuste",
  refund: "Devolución · ajuste",
};
export function CoinMarketPanel({
  coins,
  online,
}: {
  coins: CoinsController;
  online: boolean;
}) {
  const [team, setTeam] = useState<Team>("red"),
    [stake, setStake] = useState(5),
    [confirm, setConfirm] = useState<{
      market: string;
      revision: number;
    } | null>(null);
  const s = coins.snapshot,
    m = s?.market;
  if (!s || !s.settings?.enabled) return null;
  const spectator =
    !!s.player_id &&
    !!m &&
    ![...m.signature.red, ...m.signature.blue].includes(s.player_id);
  const bet = m?.own_bet,
    pool = m ? m.red_pool + m.blue_pool : 0;
  const selectedTeam = bet?.team ?? team;
  const potential = m
    ? pooledReturn(stake, pool + stake, m[`${team}_pool`] + stake)
    : 0;
  const canBet =
    !!m &&
    m.status === "open" &&
    spectator &&
    !bet &&
    online &&
    !coins.busy &&
    Number.isInteger(stake) &&
    stake >= 1 &&
    stake <= s.settings.max_stake &&
    stake <= (s.wallet?.balance ?? s.settings.initial);
  return (
    <section className="coin-market" aria-label="Apuestas en directo">
      <div className="coin-eyebrow">
        <Radio size={16} /> COINS EN DIRECTO <span>Solo puntos</span>
      </div>
      <div className="coin-market-heading">
        <h2>
          {m ? "¿Quién se lleva la pista?" : "La próxima partida te espera"}
        </h2>
        <strong>
          {pool} <Coins size={19} />
          <small>en el bote</small>
        </strong>
      </div>
      {!m ? (
        <p>Las apuestas se abren cuando se prepara una pareja en cada lado.</p>
      ) : (
        <>
          <div className="coin-sides">
            {(["red", "blue"] as const).map((t) => (
              <button
                key={t}
                className={selectedTeam === t ? "selected" : ""}
                aria-pressed={selectedTeam === t}
                disabled={!spectator || !!bet || m.status !== "open"}
                onClick={() => setTeam(t)}
              >
                <span>
                  {teamNames[t]} <b>{m.goals[t]}</b>
                </span>
                <small>{m[`${t}_pool`]} coins apostadas</small>
                <small>
                  {m.signature[t]
                    .map(
                      (id) =>
                        coins.players.find((p) => p.id === id)?.name ??
                        "Jugador",
                    )
                    .join(" y ")}
                </small>
              </button>
            ))}
          </div>
          {bet ? (
            <p className="coin-ticket">
              Tu apuesta:{" "}
              <b>
                {bet.stake} coins a {teamNames[bet.team]}
              </b>
              . Se resolverá al guardar el resultado.
              <span className="coin-ticket-estimate">
                Retorno estimado si aciertas:{" "}
                <b>
                  {pooledReturn(bet.stake, pool, m[`${bet.team}_pool`])} coins
                </b>
                . Incluye tu apuesta y puede cambiar con el bote.
              </span>
            </p>
          ) : !spectator ? (
            <p>
              Disfruta de la pista. Las apuestas están reservadas a quienes
              miran y tienen su propia cuenta de jugador.
            </p>
          ) : m.status !== "open" ? (
            <p>Apuestas cerradas: se ha alcanzado el objetivo de goles.</p>
          ) : (
            <>
              <div className="coin-stake">
                <label>
                  Tu apuesta
                  <input
                    aria-label="Coins a apostar"
                    type="number"
                    min="1"
                    max={s.settings.max_stake}
                    value={stake}
                    onChange={(e) => setStake(Number(e.target.value))}
                  />
                </label>
                <div>
                  {[5, 10, 25]
                    .filter((n) => n <= s.settings!.max_stake)
                    .map((n) => (
                      <button
                        key={n}
                        aria-pressed={stake === n}
                        onClick={() => setStake(n)}
                      >
                        {n}
                      </button>
                    ))}
                </div>
                <button
                  className="primary"
                  disabled={!canBet}
                  onClick={() =>
                    setConfirm({ market: m.id, revision: m.revision })
                  }
                >
                  Apostar <ArrowUpRight size={17} />
                </button>
              </div>
              <p className="coin-fine">
                Disponible:{" "}
                <b>{s.wallet?.balance ?? s.settings.initial} coins</b> · Máximo:{" "}
                {s.settings.max_stake} por partida.
                {stake > (s.wallet?.balance ?? s.settings.initial)
                  ? " El importe supera tu saldo."
                  : stake > s.settings.max_stake
                    ? " El importe supera el máximo."
                    : ""}
              </p>
              <p className="coin-fine">
                Retorno estimado si aciertas: <b>{potential} coins</b>, incluida
                tu apuesta. Cambia con el bote hasta el cierre.
              </p>
            </>
          )}
        </>
      )}
      {coins.error && (
        <p role="alert" className="coin-error">
          {coins.error}
        </p>
      )}
      {confirm && m && (
        <Modal title="Confirmar apuesta" onClose={() => setConfirm(null)}>
          <p>
            Apostar{" "}
            <b>
              {stake} coins a {teamNames[team]}
            </b>{" "}
            en esta partida. Una apuesta por persona; no se puede cambiar
            después.
          </p>
          <p>
            Saldo después: {(s.wallet?.balance ?? s.settings.initial) - stake}{" "}
            coins.
          </p>
          <button
            className="primary"
            disabled={
              !canBet ||
              confirm.market !== m.id ||
              confirm.revision !== m.revision
            }
            onClick={async () => {
              if (
                await coins.command("bet", {
                  market_id: confirm.market,
                  revision: confirm.revision,
                  team,
                  stake,
                })
              )
                setConfirm(null);
            }}
          >
            Confirmar {stake} coins
          </button>
          {(confirm.market !== m.id || confirm.revision !== m.revision) && (
            <p role="status">
              La partida ha cambiado. Cierra este panel y revisa la apuesta.
            </p>
          )}
          {coins.error && <p role="alert">{coins.error}</p>}
        </Modal>
      )}
    </section>
  );
}
function SettingsForm({
  settings,
  coins,
  online,
  onSaved,
}: {
  settings: CoinSettings;
  coins: CoinsController;
  online: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(settings),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="coin-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await coins.command("settings", { ...form });
        setSaved(ok);
        if (ok) onSaved();
      }}
    >
      <h3>Reglas de coins</h3>
      <label>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />{" "}
        Activar coins
      </label>
      {(
        [
          ["initial", "Saldo inicial", 0, 10000],
          ["win_bonus", "Coins por victoria", 0, 100],
          ["max_stake", "Máximo por apuesta", 1, 1000],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            required
            type="number"
            min={min}
            max={max}
            value={form[key]}
            onChange={(e) => {
              setSaved(false);
              setForm({ ...form, [key]: Number(e.target.value) });
            }}
          />
        </label>
      ))}
      <p>
        El saldo inicial se concede una vez por temporada. Cambiarlo no altera
        los saldos ya creados. Desactivar coins devuelve las apuestas abiertas.
      </p>
      <button className="secondary" disabled={coins.busy || !online}>
        Guardar reglas
      </button>
      {saved && <p role="status">Reglas guardadas</p>}
    </form>
  );
}
export function CoinsClub({
  coins,
  data,
  online,
  demo,
}: {
  coins: CoinsController;
  data: Snapshot;
  online: boolean;
  demo: boolean;
}) {
  const [tab, setTab] = useState<"coins" | "honours">("coins"),
    [publishing, setPublishing] = useState<Award[] | null>(null),
    [notice, setNotice] = useState("");
  const s = coins.snapshot,
    season = coins.season;
  if (!s || !season)
    return (
      <section className="coin-card">
        <h2>Club FutABLE</h2>
        <p role={coins.error ? "alert" : "status"}>
          {coins.error || "Cargando coins…"}
        </p>
        <button className="secondary" onClick={() => void coins.refresh()}>
          Reintentar
        </button>
      </section>
    );
  const suggestions = awardSuggestions(data, season, s.standings);
  const published = s.honours.some((h) => h.season_id === season.id);
  return (
    <div className="coins-club">
      <header className="coin-club-heading">
        <span className="coin-eyebrow">EL OTRO PARTIDO</span>
        <h1>
          Club FutABLE<span>La pista se gana. La historia se guarda.</span>
        </h1>
        <div className="coin-tabs">
          <button
            aria-pressed={tab === "coins"}
            onClick={() => setTab("coins")}
          >
            <Coins size={18} />
            Coins
          </button>
          <button
            aria-pressed={tab === "honours"}
            onClick={() => setTab("honours")}
          >
            <Trophy size={18} />
            Palmarés
          </button>
        </div>
      </header>
      {demo && (
        <p className="coin-fine">
          Demostración: los puntos se reinician al salir. No afectan a la liga
          real.
        </p>
      )}
      {tab === "coins" ? (
        <>
          <section className="coin-wallet">
            <div>
              <span>TUS COINS · {season.name}</span>
              <strong>
                {amounts.format(s.wallet?.balance ?? 0)}
                <Coins size={32} />
              </strong>
              <p>
                {s.wallet
                  ? "Tu saldo para acompañar la partida."
                  : "Empieza tu marcador fuera de la pista."}
              </p>
            </div>
            {!s.wallet &&
              s.player_id &&
              season.status === "active" &&
              s.settings?.enabled && (
                <button
                  className="primary"
                  disabled={coins.busy || !online}
                  onClick={() => void coins.command("claim")}
                >
                  Recibir {s.settings.initial} coins
                </button>
              )}
            <div className="coin-win-bonus">
              +{s.settings?.win_bonus ?? 5}
              <small>por victoria y jugador</small>
            </div>
          </section>
          <CoinMarketPanel coins={coins} online={online} />
          <div className="coin-columns">
            <section className="coin-card">
              <div className="coin-section-title">
                <Trophy size={20} />
                <h2>Clasificación de coins</h2>
              </div>
              <p className="coin-fine">
                Saldo de {season.name}. Las apuestas pendientes ya están
                descontadas.
              </p>
              {!s.standings.length ? (
                <p>La clasificación empieza con el primer saldo.</p>
              ) : (
                <ol className="coin-standings">
                  {s.standings.map((w, i) => (
                    <li
                      key={w.player_id}
                      className={w.player_id === s.player_id ? "me" : ""}
                    >
                      <span>{i + 1}</span>
                      <Avatar
                        player={{
                          name: w.name ?? "Jugador",
                          avatar_url: w.avatar_url ?? null,
                        }}
                        size="small"
                      />
                      <strong>
                        {w.name}
                        {w.player_id === s.player_id && <small> Tú</small>}
                      </strong>
                      <b>{amounts.format(w.balance)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="coin-card">
              <h2>Tus movimientos</h2>
              {!s.ledger.length ? (
                <p>Aquí verás las entradas y salidas de coins.</p>
              ) : (
                <ul className="coin-ledger">
                  {s.ledger.map((e) => (
                    <li key={e.id}>
                      <div>
                        {e.reason === "win"
                          ? e.amount > 0
                            ? "Premio por victoria"
                            : "Ajuste del premio por victoria"
                          : e.reason === "payout" && e.amount < 0
                            ? "Corrección del reparto"
                            : (reasons[e.reason] ?? e.reason)}
                        <small>
                          {new Date(e.created_at).toLocaleString("es-ES", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                      <b className={e.amount >= 0 ? "positive" : ""}>
                        {e.amount > 0 ? "+" : ""}
                        {e.amount}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          {!!s.bets.length && (
            <section className="coin-card">
              <h2>Tus últimas apuestas</h2>
              <ul className="coin-ledger">
                {s.bets.map((b) => (
                  <li key={b.id}>
                    <div>
                      {b.stake} a {teamNames[b.team]}
                      <small>
                        {b.status === "cancelled"
                          ? "Devuelta"
                          : b.status === "settled"
                            ? "Resuelta"
                            : "Pendiente"}
                      </small>
                    </div>
                    <b>
                      {b.status === "cancelled"
                        ? `${b.returned} devueltas`
                        : b.status === "settled"
                          ? b.returned
                            ? `${b.returned} recibidas`
                            : "Sin premio"
                          : "Por resolver"}
                    </b>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <details className="coin-card coin-rules">
            <summary>Cómo funcionan las coins</summary>
            <p>
              Son puntos gratuitos, sin compra, dinero ni canje. Recibes{" "}
              {s.settings?.initial ?? 100} al entrar en cada temporada y{" "}
              {s.settings?.win_bonus ?? 5} por victoria desde que se activaron
              las coins; las partidas anteriores no suman.
            </p>
            <p>
              Solo apuestan espectadores, una vez por partida, hasta{" "}
              {s.settings?.max_stake ?? 25} coins. El bote se reparte entre los
              acertantes según lo apostado; los decimales se redondean hacia
              abajo. Si nadie acierta, el bote no se reparte.
            </p>
            <p>
              Las apuestas cierran al alcanzar el objetivo o registrar el
              ganador. Una sustitución o cambio de objetivo devuelve las
              apuestas. Corregir o anular un resultado ajusta premios y
              repartos; puede dejar saldo negativo si ya gastaste esos puntos.
            </p>
          </details>
          {data.role === "admin" && (
            <details className="coin-card">
              <summary>Administrar coins</summary>
              <SettingsForm
                key={JSON.stringify(s.settings)}
                settings={
                  s.settings ?? {
                    enabled: true,
                    initial: 100,
                    win_bonus: 5,
                    max_stake: 25,
                  }
                }
                coins={coins}
                online={online}
                onSaved={() => setNotice("Reglas de coins guardadas.")}
              />
            </details>
          )}
        </>
      ) : (
        <>
          <section className="coin-honours-intro">
            <Trophy size={45} />
            <h2>Un sitio para las temporadas inolvidables.</h2>
            <p>
              Podio de liga, mejor defensa, mejor delantero, mejor pareja y
              campeón de coins. Los premios se revisan al cerrar la temporada y
              quedan guardados con los nombres de sus ganadores.
            </p>
          </section>
          {s.honours.map((h) => (
            <section className="coin-card" key={h.season_id}>
              <span className="coin-eyebrow">TEMPORADA CERRADA</span>
              <h2>
                {data.seasons.find((se) => se.id === h.season_id)?.name ??
                  "Temporada"}
              </h2>
              <div className="coin-awards">
                {h.awards.map((a, i) => (
                  <article key={i}>
                    <Trophy size={24} />
                    <span>{a.title}</span>
                    <strong>{a.players.map((p) => p.name).join(" y ")}</strong>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!published && (
            <section className="coin-card">
              <h2>
                {season.name} ·{" "}
                {season.status === "active"
                  ? "Premios en juego"
                  : "Pendiente de publicar"}
              </h2>
              <p>
                Las categorías deportivas respetan los mínimos de partidas de la
                clasificación. Los nombres siguientes son propuestas hasta su
                publicación.
              </p>
              {suggestions.length ? (
                <div className="coin-awards">
                  {suggestions.map((a) => (
                    <article key={a.title}>
                      <span>{a.title}</span>
                      <strong>
                        {a.players
                          .map(
                            (id) => data.players.find((p) => p.id === id)?.name,
                          )
                          .join(" y ")}
                      </strong>
                    </article>
                  ))}
                </div>
              ) : (
                <p>Aún no hay jugadores clasificados para proponer premios.</p>
              )}
              {data.role === "admin" &&
                season.status === "closed" &&
                !!suggestions.length && (
                  <button
                    className="primary"
                    disabled={!online || coins.busy}
                    onClick={() => setPublishing(suggestions)}
                  >
                    Revisar y publicar premios
                  </button>
                )}
              {season.status === "active" && (
                <p className="coin-fine">
                  Disponibles para publicar después de cerrar la temporada desde
                  Administración.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="confirmation">
          {notice}
        </p>
      )}
      {coins.error && (
        <p className="coin-error" role="alert">
          {coins.error}
        </p>
      )}
      {publishing && (
        <Modal title="Publicar palmarés" onClose={() => setPublishing(null)}>
          <p>
            Selecciona los premios. La publicación quedará guardada como un
            recuerdo permanente de {season.name}.
          </p>
          {suggestions.map((a) => (
            <label className="coin-award-check" key={a.title}>
              <input
                type="checkbox"
                checked={publishing.some((p) => p.title === a.title)}
                onChange={(e) =>
                  setPublishing(
                    e.target.checked
                      ? [...publishing, a]
                      : publishing.filter((p) => p.title !== a.title),
                  )
                }
              />
              <span>
                {a.title}
                <small>
                  {a.players
                    .map((id) => data.players.find((p) => p.id === id)?.name)
                    .join(" y ")}
                </small>
              </span>
            </label>
          ))}
          <button
            className="primary"
            disabled={!publishing.length || coins.busy || !online}
            onClick={async () => {
              if (await coins.command("publish", { awards: publishing }))
                setPublishing(null);
            }}
          >
            Publicar {publishing.length} premios
          </button>
          {coins.error && <p role="alert">{coins.error}</p>}
        </Modal>
      )}
    </div>
  );
}
