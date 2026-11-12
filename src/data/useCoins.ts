import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Snapshot } from "../domain/types";
import type { LiveSession } from "../domain/live";
import {
  coinDefaults,
  marketSignature,
  pooledReturn,
  type CoinsSnapshot,
  type CoinMarket,
} from "../domain/coins";
const empty = (): CoinsSnapshot => ({
  settings: coinDefaults,
  player_id: null,
  wallet: null,
  standings: [],
  ledger: [],
  bets: [],
  market: null,
  honours: [],
});
export function useCoins(
  data: Snapshot | null,
  session: LiveSession | null,
  demo: boolean,
  user: string,
  seasonId: string,
) {
  const season =
    data?.seasons.find((s) => s.id === seasonId) ??
    data?.seasons.find((s) => s.status === "active") ??
    data?.seasons[0];
  const scope = `${data?.league.id}:${season?.id}:${user}:${demo}`;
  const [snapshot, setSnapshot] = useState<CoinsSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [demoRevision, setDemoRevision] = useState(0);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const lock = useRef(false),
    request = useRef(0);
  const retry = useRef<{ key: string; input: Record<string, unknown> } | null>(
    null,
  );
  const demoState = useRef<CoinsSnapshot>(empty());
  const baseline = useRef<Set<string> | null>(null);
  const rewards = useRef(
    new Map<string, { wallet: string; amount: number; rate: number }>(),
  );
  const oldSession = useRef<LiveSession | null>(null);
  const demoMarkets = useRef(
    new Map<string, { market: CoinMarket; match: string | null }>(),
  );
  const refresh = useCallback(async () => {
    if (!data || !season || !user || demo || !supabase) return;
    const r = ++request.current,
      s = scope;
    const result = await supabase.rpc("coins_snapshot", {
      p_league: data.league.id,
      p_season: season.id,
    });
    if (s !== currentScope.current || r !== request.current) return;
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSnapshot(result.data as CoinsSnapshot);
    setError("");
  }, [data?.league.id, season?.id, user, demo, scope]);
  useEffect(() => {
    setSnapshot(null);
    setError("");
    retry.current = null;
    request.current++;
    demoState.current = empty();
    baseline.current = null;
    rewards.current.clear();
    oldSession.current = null;
    demoMarkets.current.clear();
  }, [scope, refresh]);
  useEffect(() => {
    if (demo || !data?.league.id || !season?.id || !user) return;
    const focus = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void refresh();
    };
    if (navigator.onLine) void refresh();
    const timer = setInterval(focus, 5000);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh, demo, session?.revision, data?.matches]);
  useEffect(() => {
    if (!demo || !data || !season) return;
    if (!baseline.current)
      baseline.current = new Set(data.matches.map((m) => m.id));
    const state = demoState.current;
    state.player_id = data.players[0].id;
    const wallet = (pid: string) => {
      let w = state.standings.find((w) => w.player_id === pid);
      if (!w) {
        w = {
          id: pid,
          player_id: pid,
          balance: state.settings!.initial,
          name: data.players.find((p) => p.id === pid)?.name,
        };
        state.standings.push(w);
      }
      return w;
    };
    const delta = (pid: string, n: number, reason: string) => {
      if (!n) return;
      wallet(pid).balance += n;
      if (pid === state.player_id)
        state.ledger.unshift({
          id: crypto.randomUUID(),
          amount: n,
          reason,
          created_at: new Date().toISOString(),
        });
    };
    for (const match of data.matches.filter(
      (m) => m.season_id === season.id && !baseline.current!.has(m.id),
    )) {
      const ids = new Set([
        ...match.participants.map((p) => p.player_id),
        ...[...rewards.current.entries()]
          .filter(([key]) => key.startsWith(`${match.id}:`))
          .map(([, r]) => r.wallet),
      ]);
      const rate =
        [...rewards.current.entries()].find(([key]) =>
          key.startsWith(`${match.id}:`),
        )?.[1].rate ?? state.settings!.win_bonus;
      for (const pid of ids) {
        const key = `${match.id}:${pid}`,
          prev = rewards.current.get(key)?.amount ?? 0;
        const desired =
          match.status === "valid" &&
          (state.settings!.enabled || rewards.current.has(key)) &&
          match.participants.some(
            (p) => p.player_id === pid && p.team === match.winner,
          )
            ? rate
            : 0;
        if (desired || prev) {
          delta(pid, desired - prev, "win");
          rewards.current.set(key, { wallet: pid, amount: desired, rate });
        }
      }
    }
    const previous = oldSession.current;
    if (
      session?.last_match &&
      session.last_match !== previous?.last_match &&
      state.market
    ) {
      demoMarkets.current.set(state.market.id, {
        market: state.market,
        match: session.last_match,
      });
      state.market = null;
    }
    for (const entry of demoMarkets.current.values()) {
      const bet = entry.market.own_bet;
      if (!bet) continue;
      const match = data.matches.find((m) => m.id === entry.match);
      const changed =
        match &&
        (["red", "blue"] as const).some((team) =>
          (["defender", "forward"] as const).some(
            (post, i) =>
              match.participants.find(
                (p) => p.team === team && p.position === post,
              )?.player_id !== entry.market.signature[team][i],
          ),
        );
      const cancelled =
        !entry.match ||
        match?.status === "void" ||
        !!changed ||
        bet.status === "cancelled";
      if (!match && !cancelled) continue;
      const desired = cancelled
        ? bet.stake
        : match!.winner === bet.team
          ? pooledReturn(
              bet.stake,
              entry.market.red_pool + entry.market.blue_pool,
              entry.market[`${bet.team}_pool`],
            )
          : 0;
      delta(
        state.player_id,
        desired - bet.returned,
        cancelled ? "refund" : "payout",
      );
      bet.returned = desired;
      bet.status = cancelled ? "cancelled" : "settled";
    }
    const sig = session ? marketSignature(session, season.target) : null;
    const valid =
      session?.status === "active" &&
      session.season_id === season.id &&
      sig &&
      state.settings?.enabled;
    if (
      state.market &&
      (!valid ||
        state.market.round !== session!.state.round ||
        JSON.stringify(state.market.signature) !== JSON.stringify(sig))
    ) {
      const m = state.market;
      demoMarkets.current.set(m.id, { market: m, match: null });
      if (m.own_bet) {
        delta(state.player_id, m.own_bet.stake - m.own_bet.returned, "refund");
        m.own_bet.returned = m.own_bet.stake;
        m.own_bet.status = "cancelled";
      }
      state.market = null;
    }
    if (valid) {
      if (!state.market)
        state.market = {
          id: crypto.randomUUID(),
          session_id: session.id,
          round: session.state.round,
          signature: sig,
          status: "open",
          revision: session.revision,
          goals: session.state.goals,
          red_pool: 0,
          blue_pool: 0,
          own_bet: null,
        };
      state.market.revision = session.revision;
      state.market.goals = session.state.goals;
      state.market.status =
        Math.max(...Object.values(session.state.goals)) >= sig.target
          ? "locked"
          : "open";
    }
    oldSession.current = session;
    state.wallet =
      state.standings.find((w) => w.player_id === state.player_id) ?? null;
    state.standings.sort(
      (a, b) => b.balance - a.balance || a.player_id.localeCompare(b.player_id),
    );
    setSnapshot(structuredClone(state));
  }, [data, session, demo, scope, season?.id, demoRevision]);
  const command = async (
    action: string,
    fields: Record<string, unknown> = {},
  ) => {
    if (lock.current || !data || !season) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    const requested = scope;
    const body = { season_id: season.id, ...fields };
    const key = JSON.stringify([scope, action, body]);
    if (retry.current?.key !== key)
      retry.current = {
        key,
        input: { ...body, operation_id: crypto.randomUUID() },
      };
    try {
      if (demo) {
        const state = demoState.current;
        const pid = data.players[0].id;
        if (action === "claim" || action === "bet") {
          if (!state.wallet) {
            const w = {
              id: pid,
              player_id: pid,
              balance: state.settings!.initial,
              name: data.players[0].name,
            };
            state.wallet = w;
            state.standings.push(w);
            state.ledger.unshift({
              id: crypto.randomUUID(),
              amount: w.balance,
              reason: "welcome",
              created_at: new Date().toISOString(),
            });
          }
          if (action === "bet") {
            const m = state.market,
              n = Number(fields.stake),
              team = fields.team as "red" | "blue";
            if (
              !m ||
              m.status !== "open" ||
              m.own_bet ||
              m.revision !== fields.revision
            )
              throw Error("La partida ha cambiado. Actualiza antes de apostar");
            if ([...m.signature.red, ...m.signature.blue].includes(pid))
              throw Error("Solo pueden apostar espectadores");
            if (
              !Number.isInteger(n) ||
              n < 1 ||
              n > state.settings!.max_stake ||
              n > state.wallet.balance
            )
              throw Error("Revisa el importe y tu saldo");
            state.wallet.balance -= n;
            m[`${team}_pool`] += n;
            const b = {
              id: crypto.randomUUID(),
              market_id: m.id,
              team,
              stake: n,
              returned: 0,
              created_at: new Date().toISOString(),
              round: m.round,
              status: "open",
            };
            m.own_bet = b;
            state.bets.unshift(b);
            state.ledger.unshift({
              id: crypto.randomUUID(),
              amount: -n,
              reason: "stake",
              created_at: b.created_at,
            });
          }
        } else if (action === "settings") {
          state.settings = {
            enabled: Boolean(fields.enabled),
            initial: Number(fields.initial),
            win_bonus: Number(fields.win_bonus),
            max_stake: Number(fields.max_stake),
          };
        } else if (action === "publish") {
          state.honours.unshift({
            season_id: season.id,
            published_at: new Date().toISOString(),
            awards: (
              fields.awards as { title: string; players: string[] }[]
            ).map((a) => ({
              title: a.title,
              players: a.players.map((id) => ({
                id,
                name: data.players.find((p) => p.id === id)!.name,
              })),
            })),
          });
        }
        setSnapshot(structuredClone(state));
        if (action === "settings") setDemoRevision((n) => n + 1);
      } else {
        if (!supabase || !navigator.onLine)
          throw Error("Necesitas conexión para usar las coins");
        const result = await supabase.rpc("coins_command", {
          p_league: data.league.id,
          p_action: action,
          p_input: retry.current.input,
        });
        if (result.error) throw result.error;
        await refresh();
      }
      if (requested === currentScope.current) retry.current = null;
      return true;
    } catch (e) {
      if (requested === currentScope.current)
        setError((e as { message?: string }).message ?? String(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    snapshot,
    error,
    busy,
    command,
    refresh,
    season,
    players: data?.players ?? [],
  };
}
