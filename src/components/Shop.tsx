import { useEffect, useRef, useState } from "react";
import { supabase } from "../data/supabase";
import type { Season, Snapshot, Player } from "../domain/types";
import { COSMETICS, tryCosmetic } from "../domain/cosmetics";
import { CharacterOutfit, AccessoryArt } from "./CharacterOutfit";
import { Modal } from "./ui";
import {
  Check,
  Coins,
  Crown,
  Expand,
  Glasses,
  Layers3,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
  ArrowUpRight,
  Shirt,
} from "lucide-react";
import type { CharacterMood } from "../domain/characters";
const slots = [
  { id: "head", label: "Cabeza", Icon: Crown },
  { id: "face", label: "Cara", Icon: Glasses },
  { id: "effect", label: "Efectos", Icon: Sparkles },
  { id: "base", label: "Bases", Icon: Layers3 },
] as const;
const frames: Record<string, string> = {
  glasses: "50 65 175 85",
  cap: "48 -12 185 110",
  crown: "55 -12 165 112",
  aura: "0 60 272 450",
  spark: "0 55 272 410",
  "gold-base": "28 444 216 82",
};
import "../shop.css";
export function Shop({
  data,
  me,
  season,
  demo,
  refreshCoins,
}: {
  data: Snapshot;
  me?: Player;
  season?: Season;
  demo: boolean;
  refreshCoins: () => Promise<void>;
}) {
  const [owned, setOwned] = useState<string[]>([]),
    [equipped, setEquipped] = useState<string[]>([]),
    [preview, setPreview] = useState<string[]>([]),
    [playerId, setPlayerId] = useState<string | null>(null),
    [balance, setBalance] = useState<number | null>(null),
    [catalog, setCatalog] =
      useState<
        readonly { id: string; name: string; slot: string; cost: number }[]
      >(COSMETICS),
    [buy, setBuy] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const retry = useRef<{
      action: string;
      payload: object;
      key: string;
      id: string;
    } | null>(null),
    lock = useRef(false),
    read = useRef(0);
  const [filter, setFilter] = useState("all"),
    [collection, setCollection] = useState(false),
    [mood, setMood] = useState<CharacterMood>("idle"),
    [expanded, setExpanded] = useState(false);
  const [poseKey, setPoseKey] = useState(0);
  const player = data.players.find((p) => p.id === playerId) ?? me;
  const item = catalog.find((c) => c.id === buy);
  async function refresh() {
    if (!supabase || demo) {
      setBalance(100);
      setPlayerId(data.players[0]?.id ?? null);
      return;
    }
    const n = ++read.current;
    const [s, c] = await Promise.all([
      supabase.rpc("shop_snapshot", { p_league: data.league.id }),
      season
        ? supabase.rpc("coins_snapshot", {
            p_league: data.league.id,
            p_season: season.id,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (n !== read.current) return;
    if (s.error || c.error) {
      setError((s.error || c.error)!.message);
      return;
    }
    setCatalog(s.data.catalog ?? COSMETICS);
    setOwned(s.data.owned ?? []);
    setEquipped(s.data.equipped ?? []);
    setPreview(s.data.equipped ?? []);
    setPlayerId(s.data.player_id);
    setBalance(c.data?.wallet?.balance ?? 100);
  }
  useEffect(() => {
    setBalance(null);
    setError("");
    retry.current = null;
    void refresh();
    return () => {
      read.current++;
    };
  }, [data.league.id, season?.id, demo]);
  async function action(action: string, payload: object) {
    if (lock.current) return;
    const before = [...preview];
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!supabase || demo)
        throw Error(
          "En demostración puedes probar accesorios; las compras requieren tu cuenta.",
        );
      if (!navigator.onLine) throw Error("Necesitas conexión para confirmar.");
      const key = JSON.stringify({ action, payload, season: season?.id });
      if (retry.current?.key !== key)
        retry.current = { action, payload, key, id: crypto.randomUUID() };
      const r = await supabase.rpc("shop_command", {
        p_league: data.league.id,
        p_action: action,
        p_input: { ...payload, operation_id: retry.current.id },
      });
      if (r.error) {
        if (r.error.code) retry.current = null;
        throw r.error;
      }
      retry.current = null;
      await refresh();
      await refreshCoins();
      if (action === "buy")
        setPreview(() =>
          tryCosmetic(before, (payload as { item_id: string }).item_id),
        );
      setBuy(null);
      setNotice(
        action === "buy"
          ? "Accesorio comprado. Pulsa Guardar conjunto para llevarlo; es tuyo para las próximas temporadas."
          : "Conjunto guardado. Lo llevarás en tu ficha y celebraciones.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const dirty =
    preview.slice().sort().join() !== equipped.slice().sort().join();
  const missing = preview.filter((id) => !owned.includes(id));
  const visible = catalog.filter(
    (c) =>
      (filter === "all" || c.slot === filter) &&
      (!collection || owned.includes(c.id)),
  );
  const canBuy = (cost: number) =>
    !busy &&
    !demo &&
    !!playerId &&
    season?.status === "active" &&
    !!season.rating_epoch &&
    balance !== null &&
    balance >= cost;
  function tryOn(id: string) {
    setNotice("");
    setPreview((p) =>
      p.includes(id) ? p.filter((i) => i !== id) : tryCosmetic(p, id),
    );
  }
  return (
    <div className="wardrobe">
      <header className="wardrobe-heading">
        <div>
          <span className="wardrobe-kicker">
            <Shirt size={15} /> FUTABLE / VESTUARIO
          </span>
          <h1>
            Tu juego.
            <br className="wardrobe-mobile-break" /> <em>Tu firma.</em>
          </h1>
          <p>El mismo pique. Un estilo muy tuyo.</p>
        </div>
        <div className="wardrobe-wallet" aria-label="Coins disponibles">
          <span>
            <Coins size={18} /> TU BOLSILLO
          </span>
          <strong>
            {balance ?? "…"}
            <small>coins</small>
          </strong>
          <small>{season?.name ?? "Selecciona una competición"}</small>
        </div>
      </header>
      <div className="wardrobe-layout">
        <aside
          className="wardrobe-fitting"
          aria-label="Probador de tu personaje"
        >
          <div className="wardrobe-stage">
            <div className="wardrobe-stage-top">
              <span>
                <i /> PROBADOR EN VIVO
              </span>
              <button
                onClick={() => setExpanded(true)}
                aria-label="Ampliar personaje"
              >
                <Expand size={17} />
              </button>
            </div>
            <div className="wardrobe-orbit" aria-hidden="true" />
            <div className="wardrobe-stage-word" aria-hidden="true">
              PLAY
              <br />
              YOUR
              <br />
              WAY.
            </div>
            <div className="shop-character">
              {player && (
                <CharacterOutfit
                  key={poseKey}
                  player={player}
                  items={preview}
                  mood={mood}
                />
              )}
            </div>
            <div className="wardrobe-pedestal" aria-hidden="true" />
            <div className="wardrobe-identity">
              <span>EDICIÓN PERSONAL</span>
              <h2>{player?.name ?? "Tu personaje"}</h2>
              <small>
                {preview.length
                  ? `${preview.length} de 4 espacios`
                  : "El original. Siempre tuyo."}
              </small>
            </div>
            <div className="wardrobe-poses" aria-label="Animación del probador">
              {(
                [
                  ["idle", "Normal"],
                  ["goal", "Gol"],
                  ["victory", "Victoria"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={mood === id}
                  onClick={() => {
                    setMood(id);
                    setPoseKey((n) => n + 1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="wardrobe-outfit">
            <div className="wardrobe-outfit-top">
              <span>TU CONJUNTO</span>
              <button
                title="Volver a mi conjunto"
                aria-label="Volver a mi conjunto"
                disabled={busy || !dirty}
                onClick={() => setPreview(equipped)}
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div className="wardrobe-slots">
              {slots.map(({ id, label, Icon }) => {
                const c = catalog.find(
                  (c) => c.slot === id && preview.includes(c.id),
                );
                return (
                  <button
                    key={id}
                    className={c ? "filled" : ""}
                    aria-label={
                      c
                        ? `Quitar ${c.name}`
                        : `Ver accesorios de ${label.toLowerCase()}`
                    }
                    title={c?.name ?? label}
                    onClick={() =>
                      c
                        ? setPreview((p) => p.filter((x) => x !== c.id))
                        : setFilter(id)
                    }
                  >
                    {c ? (
                      <AccessoryArt items={[c.id]} viewBox={frames[c.id]} />
                    ) : (
                      <Icon size={19} />
                    )}
                    <small>{label}</small>
                    {c && (
                      <span className="wardrobe-slot-remove">
                        <X size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              className="primary wardrobe-save"
              disabled={
                busy || missing.length > 0 || !playerId || demo || !dirty
              }
              onClick={() => void action("equip", { items: preview })}
            >
              {busy ? (
                "Guardando…"
              ) : dirty ? (
                <>
                  <Check size={16} /> Guardar conjunto
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Conjunto guardado
                </>
              )}
            </button>
            <p className="wardrobe-preview-note">
              {missing.length
                ? `Estás probando ${missing.length === 1 ? "un accesorio que aún no tienes" : `${missing.length} accesorios que aún no tienes`}. Cómpralo para guardar el look.`
                : dirty
                  ? "Te queda bien. Guarda para llevarlo a la pista."
                  : "Así aparecerás en tu ficha y al celebrar un gol."}
            </p>
          </div>
        </aside>
        <section
          className="wardrobe-catalog"
          aria-label="Catálogo de accesorios"
        >
          <div className="wardrobe-catalog-header">
            <div>
              <span className="wardrobe-kicker">COLECCIÓN / 01</span>
              <h2>
                Pequeños detalles.
                <br />
                Mucha personalidad.
              </h2>
            </div>
            <span className="wardrobe-count">
              {owned.length}
              <small>/{catalog.length} tuyos</small>
            </span>
          </div>
          <div className="wardrobe-tabs" aria-label="Catálogo o inventario">
            <button
              aria-pressed={!collection}
              onClick={() => setCollection(false)}
            >
              <ShoppingBag size={16} /> La tienda
            </button>
            <button
              aria-pressed={collection}
              onClick={() => setCollection(true)}
            >
              <Shirt size={16} /> Mi colección <span>{owned.length}</span>
            </button>
          </div>
          <div className="wardrobe-filters" aria-label="Categoría de accesorio">
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Todo
            </button>
            {slots.map(({ id, label, Icon }) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          <div className="shop-grid">
            {visible.map((c) => {
              const mine = owned.includes(c.id),
                trying = preview.includes(c.id),
                special = ["crown", "gold-base"].includes(c.id);
              return (
                <article
                  key={c.id}
                  data-item={c.id}
                  className={`shop-item ${special ? "signature" : ""} ${trying ? "trying" : ""}`}
                >
                  <div className="shop-item-art">
                    <span className="wardrobe-item-number">
                      {String(
                        catalog.findIndex((x) => x.id === c.id) + 1,
                      ).padStart(2, "0")}
                    </span>
                    <span className="wardrobe-item-label">
                      {special
                        ? "FIRMA"
                        : c.slot === "effect"
                          ? "EN MOVIMIENTO"
                          : "ESENCIAL"}
                    </span>
                    <div className="wardrobe-item-halo" />
                    <AccessoryArt items={[c.id]} viewBox={frames[c.id]} />
                    {trying && (
                      <span className="wardrobe-trying">
                        <Check size={12} /> En el probador
                      </span>
                    )}
                  </div>
                  <div className="shop-item-body">
                    <span className="wardrobe-item-type">
                      {slots.find((s) => s.id === c.slot)?.label} · Permanente
                    </span>
                    <h3>{c.name}</h3>
                    <p>
                      {COSMETICS.find((i) => i.id === c.id)?.description ??
                        "Dale tu toque al personaje."}
                    </p>
                    <div className="wardrobe-price">
                      {mine ? (
                        <span className="shop-owned">
                          <Check size={15} /> En tu inventario
                        </span>
                      ) : (
                        <strong>
                          <Coins size={16} />
                          {c.cost}
                          <small>coins</small>
                        </strong>
                      )}
                    </div>
                    <div className="wardrobe-item-actions">
                      <button
                        className="wardrobe-try"
                        aria-pressed={trying}
                        onClick={() => tryOn(c.id)}
                      >
                        {trying ? "Quitar prueba" : "Probar"}
                      </button>
                      {mine ? (
                        <span className="wardrobe-owned-mark">
                          <ShieldCheck size={17} /> Tuyo
                        </span>
                      ) : (
                        <button
                          className="primary"
                          disabled={!canBuy(c.cost)}
                          onClick={() => setBuy(c.id)}
                        >
                          Comprar
                        </button>
                      )}
                    </div>
                    {!mine && balance !== null && balance < c.cost && (
                      <small className="wardrobe-shortfall">
                        Te faltan {c.cost - balance} coins
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!visible.length && (
            <div className="wardrobe-empty">
              <Shirt size={32} />
              <h3>
                {collection
                  ? "Tu colección empieza aquí."
                  : "No hay accesorios en esta categoría."}
              </h3>
              <p>Prueba un accesorio en tu personaje y encuentra tu estilo.</p>
              <button
                className="secondary"
                onClick={() => {
                  setCollection(false);
                  setFilter("all");
                }}
              >
                Explorar la tienda <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <details className="wardrobe-rules">
            <summary>
              <ShieldCheck size={17} /> Tuyo, temporada tras temporada.
            </summary>
            <p>
              Los accesorios se compran una sola vez y no caducan. Puedes
              combinar una pieza de cabeza, una de cara, un efecto y una base.
              No modifican el MMR.
            </p>
            <p>
              Comprar no reduce tu puntuación para «Ludópata»: se suman las
              coins que hayas gastado en accesorios. Los bolsillos de Liga y
              Copa siguen separados; cambia de competición para elegir cuál
              usar.
            </p>
          </details>
        </section>
      </div>
      {error && !item && (
        <p className="wardrobe-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="wardrobe-notice">
          <Check size={18} />
          {notice}
          <button onClick={() => setNotice("")} aria-label="Cerrar aviso">
            <X size={16} />
          </button>
        </p>
      )}
      {expanded && (
        <Modal
          title={`El personaje de ${player?.name ?? "tu cuenta"}`}
          onClose={() => setExpanded(false)}
        >
          <div className="wardrobe-full-character">
            {player && (
              <CharacterOutfit
                key={poseKey}
                player={player}
                items={preview}
                mood={mood}
              />
            )}
          </div>
          <p className="wardrobe-modal-note">
            Vista previa de tu conjunto. Puedes cambiar la pose en el probador.
          </p>
        </Modal>
      )}
      {item && (
        <Modal
          title={`Comprar ${item.name}`}
          onClose={() => {
            if (!busy) setBuy(null);
          }}
        >
          <div className="wardrobe-confirm-art" data-item={item.id}>
            <AccessoryArt items={[item.id]} viewBox={frames[item.id]} />
          </div>
          <p className="wardrobe-confirm-description">
            Una pieza para tu colección. Tuya en esta temporada y en las
            siguientes.
          </p>
          <div className="wardrobe-receipt">
            <span>
              {item.name}
              <b>{item.cost} coins</b>
            </span>
            <span>
              Bolsillo<small>{season?.name}</small>
            </span>
            <span>
              Saldo después<b>{(balance ?? 0) - item.cost} coins</b>
            </span>
          </div>
          <p className="wardrobe-modal-note">
            <ShieldCheck size={15} /> Compra cosmética · no afecta al MMR ni al
            premio de coins.
          </p>
          {error && (
            <p className="wardrobe-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              disabled={busy}
              className="text-button"
              onClick={() => setBuy(null)}
            >
              Cancelar
            </button>
            <button
              className="primary"
              disabled={!canBuy(item.cost)}
              onClick={() =>
                void action("buy", {
                  item_id: item.id,
                  expected_cost: item.cost,
                  season_id: season?.id,
                })
              }
            >
              {busy ? "Confirmando…" : `Confirmar compra · ${item.cost} coins`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
