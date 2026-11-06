import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSession, LiveState, Lineup } from "../domain/live";
import {
  assignPosts,
  boardScore,
  emptyState,
  join,
  leave,
  liveParticipants,
  rotate,
  scoreGoal,
  startCourt,
} from "../domain/live";
import type { MatchInput, Snapshot, Team } from "../domain/types";
import { supabase } from "./supabase";

export interface LiveFields {
  players?: string[];
  player?: string;
  lineup?: Lineup;
  winner?: Team;
  team?: Team;
  delta?: number;
  defender?: string;
  forward?: string;
}

export function useLiveSession({
  data,
  demo,
  user,
  refreshLeague,
  demoMatch,
  demoVoid,
}: {
  data: Snapshot | null;
  demo: boolean;
  user: string;
  refreshLeague: () => Promise<void>;
  demoMatch: (input: MatchInput, id: string) => void;
  demoVoid: (id: string) => void;
}) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const scope = `${data?.league.id || ""}:${user}:${demo}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const current = useRef(session);
  current.current = session;
  const locked = useRef(false);
  const reads = useRef(0);
  const retry = useRef<{
    operation: string;
    scope: string;
    input: Record<string, unknown>;
  } | null>(null);
  const refresh = useCallback(async () => {
    if (demo || !supabase || !data || !user) return;
    const requested = scope;
    const read = ++reads.current;
    const result = await supabase
      .from("live_sessions")
      .select("*")
      .eq("league_id", data.league.id)
      .eq("status", "active")
      .maybeSingle();
    if (requested !== currentScope.current || read !== reads.current) return;
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const next = result.data as LiveSession | null;
    setSession((previous) =>
      previous &&
      next &&
      previous.id === next.id &&
      previous.revision > next.revision
        ? previous
        : next,
    );
    setError("");
    setLoading(false);
  }, [data?.league.id, demo, user, scope]);
  useEffect(() => {
    setSession(null);
    setError("");
    setLoading(!demo && !!data && !!user);
    void refresh();
    if (demo || !data || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`live:${scope}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_sessions",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .subscribe();
    // The query, not the event, is the source of truth for a shared court.
    const recover = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void refresh();
    };
    const timer = window.setInterval(recover, 10000);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      void client.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [refresh, scope]);

  const demoApply = (
    action: string,
    fields: LiveFields,
    before: LiveSession | null,
    seasonId: string,
    operation: string,
  ): LiveSession | null => {
    if (!data) throw new Error("No hay liga.");
    if (!before) {
      if (action !== "join")
        throw new Error("No hay ninguna sesión en directo abierta.");
      return {
        id: crypto.randomUUID(),
        league_id: data.league.id,
        season_id: seasonId,
        owner_id: user,
        status: "active",
        state: join(emptyState(), fields.players!),
        revision: 1,
        last_match: null,
        last_before: null,
      };
    }
    const next: LiveSession = { ...before, revision: before.revision + 1 };
    if (action === "join") next.state = join(before.state, fields.players!);
    if (action === "leave") next.state = leave(before.state, fields.player!);
    if (action === "join" || action === "leave") {
      next.last_match = null;
      next.last_before = null;
    }
    if (action === "start")
      next.state = startCourt(before.state, fields.lineup!);
    if (action === "assign")
      next.state = assignPosts(
        before.state,
        fields.team!,
        fields.defender!,
        fields.forward!,
      );
    if (action === "goal")
      next.state = scoreGoal(before.state, fields.team!, fields.delta!);
    if (action === "result") {
      const board = boardScore(before.state, fields.winner!);
      next.state = rotate(before.state, fields.winner!, Math.random());
      next.last_before = before.state;
      next.last_match = crypto.randomUUID();
      demoMatch(
        {
          operation_id: operation,
          season_id: seasonId,
          blue_score: board.blue,
          red_score: board.red,
          winner: fields.winner,
          participants: liveParticipants(before.state),
        },
        next.last_match,
      );
    }
    if (action === "undo") {
      if (!before.last_match || !before.last_before)
        throw new Error("No hay resultado para deshacer.");
      demoVoid(before.last_match);
      next.state = before.last_before as LiveState;
      next.last_before = null;
      next.last_match = null;
    }
    if (action === "close") next.status = "closed";
    return next;
  };

  const command = async (
    action: string,
    fields: LiveFields,
    operation: string,
  ) => {
    if (locked.current)
      throw new Error("Espera a que termine la operación anterior.");
    if (!navigator.onLine)
      throw new Error("Sin conexión. No se ha confirmado ningún resultado.");
    const season = data?.seasons.find((s) =>
      action === "close"
        ? s.id === current.current?.season_id
        : s.status === "active",
    );
    if (!data || !season) throw new Error("No hay temporada activa.");
    const before = current.current;
    const requested = scope;
    locked.current = true;
    try {
      if (demo) {
        const next = demoApply(action, fields, before, season.id, operation);
        current.current = next?.status === "active" ? next : null;
        setSession(current.current);
      } else {
        if (!supabase) throw new Error("Inicia sesión.");
        if (
          retry.current?.operation !== operation ||
          retry.current.scope !== scope
        )
          retry.current = {
            operation,
            scope,
            input: {
              ...fields,
              season_id: season.id,
              session_id: before?.id,
              revision: before?.revision,
              operation_id: operation,
            },
          };
        const result = await supabase.rpc("live_session_command", {
          p_league: data.league.id,
          p_action: action,
          p_input: retry.current.input,
        });
        if (result.error) {
          // A database rejection is definite. A lost response must retry the exact request.
          if (result.error.code) retry.current = null;
          void refresh();
          throw new Error(result.error.message);
        }
        if (requested !== currentScope.current) return;
        retry.current = null;
        reads.current++;
        const next = result.data as LiveSession;
        current.current = next.status === "active" ? next : null;
        setSession(current.current);
        await refreshLeague();
      }
      setError("");
    } finally {
      locked.current = false;
    }
  };
  return { session, loading, error, refresh, command };
}
