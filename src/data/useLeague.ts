import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Match, MatchInput, Snapshot } from "../domain/types";
import { createDemo } from "../demo/data";
import { supabase } from "./supabase";
export function useLeague() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [demo, setDemo] = useState(false),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [synced, setSynced] = useState<Date | null>(null),
    [live, setLive] = useState(false);
  const current = useRef(data);
  current.current = data;
  const seq = useRef(0),
    leagueId = useRef<string | null>(null),
    pending = useRef(false),
    queued = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(data.session);
      setAuthReady(true);
      if (error) setError(error.message);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      seq.current++;
      leagueId.current = null;
      setSession(s);
      setData(null);
      setError("");
      setAuthReady(true);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (demo || !supabase || !session) return;
    if (pending.current) {
      queued.current = true;
      return;
    }
    pending.current = true;
    const request = seq.current;
    try {
      let id = leagueId.current;
      if (!id) {
        const { data, error } = await supabase
          .from("league_memberships")
          .select("league_id")
          .eq("user_id", session.user.id)
          .eq("active", true)
          .order("league_id")
          .limit(1);
        if (error) throw error;
        if (!data?.length) {
          const joined = await supabase.rpc("join_open_league");
          if (joined.error) throw joined.error;
          id = joined.data as string;
        } else id = data[0].league_id as string;
        leagueId.current = id;
      }
      const { data, error } = await supabase.rpc("league_snapshot", {
        p_league: id,
      });
      if (error) throw error;
      if (request === seq.current) {
        setData(data as Snapshot);
        setSynced(new Date());
        setError("");
      }
    } catch (e) {
      if (request === seq.current) {
        const message =
          e instanceof Error
            ? e.message
            : String((e as { message?: string }).message || e);
        setError(message);
        if (/autorizado|permission|access/i.test(message)) setData(null);
      }
    } finally {
      pending.current = false;
      setLoading(false);
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [demo, session]);
  useEffect(() => {
    setLoading(Boolean(session && !demo));
    void refresh();
  }, [refresh, session, demo]);
  useEffect(() => {
    const reconnect = () => {
      setOnline(true);
      void refresh();
    };
    const offline = () => {
      setOnline(false);
      setLive(false);
    };
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", focus);
    // Query recovery covers missed events, websocket failures and membership revocations.
    const poll = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible")
        void refresh();
    }, 30000);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
      clearInterval(poll);
    };
  }, [refresh]);
  useEffect(() => {
    if (!supabase || !data || demo) return;
    const channel = supabase
      .channel(`league:${data.league.id}`)
      .on("system", {}, (event) => {
        if (event.extension === "postgres_changes" && event.status === "ok") {
          setLive(true);
          void refresh();
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "seasons",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "league_memberships",
          filter: `league_id=eq.${data.league.id}`,
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") setLive(false);
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      void supabase?.removeChannel(channel);
      setLive(false);
    };
  }, [data?.league.id, demo, refresh]);
  const startDemo = () => {
    seq.current++;
    setDemo(true);
    setData(createDemo());
    setSynced(new Date());
    setError("");
  };
  const logout = async () => {
    seq.current++;
    leagueId.current = null;
    setData(null);
    setDemo(false);
    setError("");
    if (session) await supabase?.auth.signOut();
  };
  const save = async (input: MatchInput, edit?: Match, reason?: string) => {
    if (!navigator.onLine)
      throw new Error("Sin conexión. La partida no se ha guardado.");
    if (demo) {
      setData((d) => {
        if (!d) return d;
        const exists = d.matches.find(
          (m) => m.operation_id === input.operation_id,
        );
        if (exists) return d;
        const now = new Date().toISOString();
        const m: Match = {
          ...input,
          id: edit?.id || crypto.randomUUID(),
          league_id: d.league.id,
          winner: input.blue_score > input.red_score ? "blue" : "red",
          played_at: edit?.played_at || now,
          created_at: edit?.created_at || now,
          created_by: "demo",
          status: "valid",
          revision: (edit?.revision || 0) + 1,
        };
        return {
          ...d,
          matches: [m, ...d.matches.filter((x) => x.id !== m.id)],
        };
      });
      return;
    }
    if (!supabase || !current.current) throw new Error("Inicia sesión.");
    const { error } = await supabase.rpc("save_match", {
      p_league: current.current.league.id,
      p_input: input,
      p_match: edit?.id || null,
      p_revision: edit?.revision || null,
      p_reason: reason || null,
    });
    if (error) throw new Error(error.message);
    await refresh();
  };
  const admin = async (action: string, payload: Record<string, unknown>) => {
    if (!navigator.onLine)
      throw new Error("Necesitas conexión para administrar la liga.");
    if (demo)
      throw new Error(
        "La administración requiere una liga conectada. La demostración solo permite explorar y registrar partidas temporales.",
      );
    if (!supabase || !current.current) throw new Error("Inicia sesión.");
    const { error } = await supabase.rpc("admin_command", {
      p_league: current.current.league.id,
      p_action: action,
      p_data: payload,
    });
    if (error) throw new Error(error.message);
    await refresh();
  };
  const saveProfile = async (name: string, photo: string | null) => {
    if (!navigator.onLine)
      throw new Error("Necesitas conexión para guardar tu perfil.");
    if (demo) {
      setData((d) =>
        d
          ? {
              ...d,
              players: d.players.map((p, i) =>
                i === 0 ? { ...p, name, avatar_url: photo } : p,
              ),
            }
          : d,
      );
      return;
    }
    if (!supabase || !current.current || !session)
      throw new Error("Inicia sesión.");
    const { error } = await supabase.rpc("save_my_profile", {
      p_league: current.current.league.id,
      p_name: name,
      p_avatar: photo,
    });
    if (error) throw new Error(error.message);
    await refresh();
  };
  return {
    data,
    demo,
    session,
    authReady,
    error,
    setError,
    loading,
    online,
    synced,
    live,
    refresh,
    startDemo,
    logout,
    save,
    admin,
    saveProfile,
  };
}
