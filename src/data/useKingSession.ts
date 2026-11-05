import { useCallback, useEffect, useRef, useState } from "react";
import type { Court, KingSession } from "../domain/king";
import { advanceCourt, courtParticipants } from "../domain/king";
import type { MatchInput, Snapshot, Team } from "../domain/types";
import { supabase } from "./supabase";

export function useKingSession({
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
  const [session, setSession] = useState<KingSession | null>(null);
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
      .from("king_sessions")
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
    const next = result.data as KingSession | null;
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
      .channel(`king:${scope}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "king_sessions",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .subscribe();
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

  const command = async (
    action: string,
    fields: {
      state?: Court;
      winner?: Team;
      blue_score?: number | null;
      red_score?: number | null;
    },
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
        let next: KingSession;
        if (action === "start")
          next = {
            id: crypto.randomUUID(),
            league_id: data.league.id,
            season_id: season.id,
            owner_id: user,
            state: fields.state!,
            status: "active",
            revision: 1,
            last_before: null,
            last_match: null,
          };
        else {
          if (!before) throw new Error("Abre una sesión primero.");
          next = { ...before, revision: before.revision + 1 };
          if (action === "configure")
            next = {
              ...next,
              state: fields.state!,
              last_before: null,
              last_match: null,
            };
          if (action === "result") {
            next = {
              ...next,
              state: advanceCourt(before.state, fields.winner!),
              last_before: before.state,
              last_match: crypto.randomUUID(),
            };
            demoMatch(
              {
                operation_id: operation,
                season_id: season.id,
                blue_score: fields.blue_score ?? null,
                red_score: fields.red_score ?? null,
                winner: fields.winner,
                participants: courtParticipants(before.state),
              },
              next.last_match!,
            );
          }
          if (action === "undo") {
            if (!before.last_match || !before.last_before)
              throw new Error("No hay resultado para deshacer.");
            demoVoid(before.last_match);
            next = {
              ...next,
              state: before.last_before,
              last_before: null,
              last_match: null,
            };
          }
          if (action === "close") next = { ...next, status: "closed" };
        }
        current.current = next.status === "active" ? next : null;
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
        const result = await supabase.rpc("king_session_command", {
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
        const next = result.data as KingSession;
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
