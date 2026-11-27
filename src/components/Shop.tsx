import { useEffect, useRef, useState } from "react";
import { supabase } from "../data/supabase";
import type { Season, Snapshot, Player } from "../domain/types";
import { COSMETICS, tryCosmetic } from "../domain/cosmetics";
import { CharacterOutfit, AccessoryArt } from "./CharacterOutfit";
import { Modal } from "./ui";
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
        setPreview((p) =>
          tryCosmetic(p, (payload as { item_id: string }).item_id),
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
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">TU ESTILO EN LA PISTA</span>
        <h1>
          El vestuario<span>.</span>
        </h1>
        <p>
          Accesorios con tus coins. Solo estilo: tu MMR y tu juego permanecen
          iguales.
        </p>
      </div>
      <div className="shop-layout">
        <aside className="panel shop-model">
          <div className="shop-character">
            {player && (
              <CharacterOutfit
                player={player}
                items={preview}
                mood={buy ? "victory" : "idle"}
              />
            )}
          </div>
          <h2>{player?.name ?? "Tu personaje"}</h2>
          <small>Vista previa · puedes probar antes de comprar</small>
          <div className="shop-wallet">
            <span>{season?.name ?? "Elige una competición"}</span>
            <strong>
              {balance ?? "…"} <small>coins disponibles</small>
            </strong>
          </div>
          <p>
            Gastar en accesorios no reduce tu puntuación para «Ludópata». El
            inventario se conserva entre temporadas.
          </p>
          <button
            className="primary"
            disabled={
              busy ||
              preview.some((id) => !owned.includes(id)) ||
              !playerId ||
              demo
            }
            onClick={() => void action("equip", { items: preview })}
          >
            Guardar conjunto
          </button>
          <button className="text-button" onClick={() => setPreview(equipped)}>
            Volver a mi conjunto
          </button>
          <button className="text-button" onClick={() => setPreview([])}>
            Quitar accesorios
          </button>
        </aside>
        <section>
          <div className="shop-grid">
            {catalog.map((c) => {
              const mine = owned.includes(c.id),
                trying = preview.includes(c.id);
              return (
                <article
                  key={c.id}
                  data-item={c.id}
                  className={`panel shop-item ${trying ? "trying" : ""}`}
                >
                  <div className="shop-item-art">
                    <AccessoryArt items={[c.id]} />
                  </div>
                  <span className="eyebrow">
                    {c.slot === "head"
                      ? "CABEZA"
                      : c.slot === "face"
                        ? "CARA"
                        : c.slot === "base"
                          ? "BASE"
                          : "EFECTO"}
                  </span>
                  <h3>{c.name}</h3>
                  <p>{COSMETICS.find((i) => i.id === c.id)?.description}</p>
                  <strong>
                    {mine ? "En tu inventario" : `${c.cost} coins`}
                  </strong>
                  <div>
                    <button
                      className="secondary"
                      onClick={() =>
                        setPreview((p) =>
                          trying
                            ? p.filter((id) => id !== c.id)
                            : tryCosmetic(p, c.id),
                        )
                      }
                    >
                      {trying ? "Quitar prueba" : "Probar"}
                    </button>
                    {!mine && (
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          demo ||
                          !playerId ||
                          season?.status !== "active" ||
                          !season?.rating_epoch ||
                          balance === null ||
                          (balance ?? 100) < c.cost
                        }
                        onClick={() => setBuy(c.id)}
                      >
                        Comprar
                      </button>
                    )}
                    {mine && <span className="shop-owned">Tuyo ✓</span>}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="rule-note">
            Los accesorios se compran una sola vez y puedes combinarlos: uno de
            cabeza, uno de cara, un efecto y una base. Las coins de Liga y cada
            Copa siguen separadas; elige el bolsillo con el selector de
            competición.
          </p>
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="toast">
          {notice}
        </p>
      )}
      {item && (
        <Modal
          title={`Comprar ${item.name}`}
          onClose={() => {
            if (!busy) setBuy(null);
          }}
        >
          <p>
            Gastarás <b>{item.cost} coins</b> de {season?.name}.
          </p>
          <p>
            Saldo después: {(balance ?? 100) - item.cost} coins. Este accesorio
            permanecerá en tu inventario y no afecta a tu MMR ni al premio de
            coins.
          </p>
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
              disabled={busy}
              onClick={() =>
                void action("buy", {
                  item_id: item.id,
                  expected_cost: item.cost,
                  season_id: season?.id,
                })
              }
            >
              Confirmar compra · {item.cost} coins
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
