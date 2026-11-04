import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { useLeague } from "./data/useLeague";
import { passwordFlow } from "./data/supabase";
import { defaultRules, type Match } from "./domain/types";
import { pairRanking, ranking } from "./domain/rankings";
import { Auth } from "./components/Auth";
import {
  Avatar,
  Empty,
  LinkButton,
  Logo,
  Modal,
  pct,
  SectionTitle,
} from "./components/ui";
import { Rankings, RankTable } from "./components/Rankings";
import { History, Result } from "./components/History";
import { Players } from "./components/Players";
import { Admin } from "./components/Admin";
import { MatchForm } from "./components/MatchForm";
import { FoosballVisual } from "./components/FoosballVisual";
import { InstallHelp } from "./components/InstallHelp";
import { MyProfile } from "./components/MyProfile";
const nav = [
  ["home", "Inicio", Home],
  ["rankings", "Clasificaciones", BarChart3],
  ["players", "Jugadores", Users],
  ["history", "Historial", Activity],
] as const;
export default function App() {
  const league = useLeague();
  const { data, demo, online, synced, live } = league;
  const [page, setPage] = useState("home"),
    [seasonId, setSeasonId] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [matchForm, setMatchForm] = useState(false),
    [edit, setEdit] = useState<Match | undefined>(),
    [voidMatch, setVoidMatch] = useState<Match | null>(null),
    [reason, setReason] = useState(""),
    [voidBusy, setVoidBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false),
    [myProfile, setMyProfile] = useState(false),
    [sidebar, setSidebar] = useState(false),
    [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null),
    [recovery, setRecovery] = useState(passwordFlow);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    let fresh = false;
    let hasController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting) setUpdate(reg);
        reg.addEventListener("updatefound", () => {
          reg.installing?.addEventListener("statechange", () => {
            if (reg.waiting && navigator.serviceWorker.controller)
              setUpdate(reg);
          });
        });
      })
      .catch(() => {});
    const reload = () => {
      // Initial installation must not interrupt an open form or demo session.
      if (!hasController) {
        hasController = true;
        return;
      }
      if (!fresh) {
        fresh = true;
        location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
  }, []);
  useEffect(() => {
    setSeasonId("");
    setMyProfile(false);
    setSelected(null);
    setPage("home");
    window.scrollTo(0, 0);
  }, [data?.league.id]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const navigate = (p: string) => {
    setPage(p);
    setSelected(null);
    setSidebar(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (location.pathname !== "/")
    return (
      <main className="not-found">
        <Logo />
        <h1>Esta página no existe.</h1>
        <a href="/" className="primary">
          Volver a Liga FutABLE
        </a>
      </main>
    );
  if (recovery)
    return (
      <Auth
        onDemo={() => {
          setRecovery(false);
          league.startDemo();
        }}
      />
    );
  if (!league.authReady)
    return (
      <div className="loading">
        <Logo />
        <p>Preparando la liga…</p>
      </div>
    );
  if (!data) {
    if (league.session)
      return (
        <div className="loading">
          <Logo />
          <h2>
            {league.loading ? "Conectando con tu liga…" : "Tu liga te espera"}
          </h2>
          {league.error && (
            <p role="alert" className="error">
              {league.error}
            </p>
          )}
          <button className="secondary" onClick={() => void league.refresh()}>
            Reintentar
          </button>
          <button className="text-button" onClick={() => void league.logout()}>
            Cerrar sesión
          </button>
        </div>
      );
    return <Auth onDemo={league.startDemo} />;
  }
  const active = data.seasons.find((s) => s.status === "active"),
    season =
      data.seasons.find((s) => s.id === seasonId) || active || data.seasons[0];
  const ownPlayer = demo
    ? data.players[0]
    : data.players.find((p) => p.account_id === league.session?.user.id);
  const allTime = seasonId === "all";
  const rules = allTime ? defaultRules : season || defaultRules;
  const matches = data.matches.filter(
      (m) => allTime || m.season_id === season?.id,
    ),
    valid = matches.filter((m) => m.status === "valid"),
    rows = ranking(data.players, matches, rules),
    competitive = rows.filter((r) => r.qualified),
    defender = ranking(data.players, matches, rules, "defender").find(
      (r) => r.qualified,
    ),
    forward = ranking(data.players, matches, rules, "forward").find(
      (r) => r.qualified,
    ),
    pair = pairRanking(data.players, matches, rules).find((p) => p.qualified),
    last = valid[0];
  const showPlayer = (id: string) => {
    setSelected(id);
    setPage("players");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const ownStats = rows.find((row) => row.player.id === ownPlayer?.id);
  const newMatch = () => {
    if (!active) {
      setNotice("Crea una temporada activa desde Administración.");
      return;
    }
    setEdit(undefined);
    setMatchForm(true);
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <Logo />
          <span>
            LIGA<strong>FutABLE</strong>
            <small>ABLE HUMAN MOTION</small>
          </span>
        </a>
        <div className="sidebar-caption">TU LIGA. TU EQUIPO.</div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              className={page === key ? "active" : ""}
              key={key}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              {label}
              {page === key && <i />}
            </button>
          ))}
          {data.role === "admin" && (
            <>
              <span className="nav-separator" />
              <button
                className={page === "admin" ? "active" : ""}
                onClick={() => navigate("admin")}
              >
                <Settings size={19} />
                Administración
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="league-seal">
            <Shield size={23} />
            <div>
              <strong>Una liga entre compañeros.</strong>
              <span>
                La competición se queda aquí.
                <br />
                El buen ambiente, en todas partes.
              </span>
            </div>
          </div>
          <button className="text-button" onClick={() => setHelp(true)}>
            <CircleHelp size={17} /> Cómo funciona la liga
          </button>
          <button
            className="account"
            aria-label="Mi perfil"
            onClick={() => {
              setMyProfile(true);
              setSidebar(false);
            }}
            disabled={!ownPlayer}
          >
            <Avatar
              player={ownPlayer || { name: "Mi cuenta", avatar_url: null }}
              size="small"
            />
            <span>
              <strong>
                {demo ? "Modo demostración" : ownPlayer?.name || "Mi cuenta"}
              </strong>
              <small>
                {demo
                  ? "Datos ficticios"
                  : data.role === "admin"
                    ? "Administrador"
                    : "Jugador autorizado"}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebar(false)}
          aria-label="Cerrar menú"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setSidebar(true)}
              aria-label="Abrir menú"
            >
              <Menu size={21} />
            </button>
            <span className="topbar-crumb">
              LA LIGA DE LA OFICINA <ChevronRight size={14} />
              <strong>
                {page === "admin"
                  ? "Administración"
                  : nav.find((n) => n[0] === page)?.[1]}
              </strong>
            </span>
            <span className="mobile-brand">
              <Logo /> FUTABLE
            </span>
          </div>
          <div className="topbar-right">
            {ownPlayer && (
              <button
                className="profile-trigger"
                aria-label="Mi perfil"
                title="Mi perfil"
                onClick={() => setMyProfile(true)}
              >
                <Avatar player={ownPlayer} size="small" />
              </button>
            )}
            <InstallHelp compact />
            <span className={`connection ${online ? "" : "offline"}`}>
              <i />
              {demo
                ? "Demostración"
                : !online
                  ? "Sin conexión"
                  : live
                    ? "En directo"
                    : "Conectando"}
            </span>
            <button
              className="icon-button"
              title="Actualizar datos"
              onClick={() => {
                if (demo)
                  setNotice(
                    "La demostración usa datos temporales. Conecta Supabase para sincronizar.",
                  );
                else void league.refresh();
              }}
              aria-label="Actualizar datos"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main className="content">
          {demo && (
            <div className="demo-banner">
              <span>
                <i /> ESTÁS EXPLORANDO UNA DEMOSTRACIÓN
              </span>
              <button onClick={() => void league.logout()}>
                Conectar mi liga <ArrowRight size={13} />
              </button>
            </div>
          )}
          {!online && (
            <div className="error offline-banner">
              <WifiOff size={17} /> Sin conexión. Se muestran los últimos datos
              cargados; no puedes confirmar partidas.
            </div>
          )}
          {league.error && (
            <div className="error" role="alert">
              {league.error}
              <button
                className="text-button"
                onClick={() => void league.refresh()}
              >
                Reintentar
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              {notice}
              <button
                className="icon-button"
                onClick={() => setNotice("")}
                aria-label="Cerrar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {update && (
            <div className="info-note">
              <p>Hay una nueva versión disponible.</p>
              <button
                className="text-button"
                onClick={() => update.waiting?.postMessage("ACTIVATE_UPDATE")}
              >
                Actualizar aplicación
              </button>
            </div>
          )}
          <div className="season-selector">
            <span className="season-dot" />
            <select
              aria-label="Temporada"
              value={allTime ? "all" : season?.id || ""}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              {data.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "closed" ? " · Cerrada" : ""}
                </option>
              ))}
              <option value="all">Histórico global</option>
            </select>
            <ChevronDown size={14} />
            <span className="season-info">
              {allTime
                ? "Reglas globales: ajuste 10/20 · mínimo 10 PJ"
                : season?.status === "active"
                  ? "TEMPORADA EN JUEGO"
                  : "ARCHIVO DE TEMPORADA"}
            </span>
          </div>
          {page === "home" && (
            <>
              <div className="home-heading">
                <div>
                  <span className="eyebrow">
                    ABLE HUMAN MOTION · LA LIGA DE LA OFICINA
                  </span>
                  <h1>
                    {ownPlayer
                      ? `Hola, ${ownPlayer.name.split(" ")[0]}.`
                      : "Tu liga, al día."}
                  </h1>
                  <p>Un buen día para jugar en equipo.</p>
                </div>
                <button
                  className="primary"
                  onClick={newMatch}
                  disabled={!online}
                >
                  <Plus size={19} /> Nueva partida
                </button>
              </div>
              {ownPlayer && ownStats && (
                <section className="personal-season" aria-label="Tu temporada">
                  <button
                    className="personal-identity"
                    onClick={() => setMyProfile(true)}
                    aria-label="Editar mi perfil"
                  >
                    <Avatar player={ownPlayer} />
                    <span>
                      <small>{allTime ? "TU HISTORIAL" : "TU TEMPORADA"}</small>
                      <strong>{ownPlayer.name}</strong>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="personal-numbers">
                    <div>
                      <strong>{ownStats.games}</strong>
                      <span>Partidas</span>
                    </div>
                    <div>
                      <strong>{ownStats.wins}</strong>
                      <span>Victorias</span>
                    </div>
                    <div>
                      <strong>{ownStats.streak}</strong>
                      <span>Racha actual</span>
                    </div>
                  </div>
                  <div className="personal-progress">
                    <span>
                      {ownStats.qualified
                        ? "En competición"
                        : "Camino a la clasificación"}
                      <strong>
                        {ownStats.qualified
                          ? pct(ownStats.adjusted)
                          : `${ownStats.games} / ${rules.minimum} PJ`}
                      </strong>
                    </span>
                    <div
                      role="progressbar"
                      aria-label="Partidas para clasificar"
                      aria-valuemin={0}
                      aria-valuemax={rules.minimum}
                      aria-valuenow={Math.min(ownStats.games, rules.minimum)}
                    >
                      <i
                        style={{
                          width: `${Math.min(100, (ownStats.games / rules.minimum) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </section>
              )}
              <div className="hero-grid">
                <section className="hero-card">
                  <div className="hero-copy">
                    <span className="live-pill">
                      <i />
                      {valid.length
                        ? "LA TEMPORADA ESTÁ VIVA"
                        : "TODO ESTÁ POR JUGAR"}
                    </span>
                    <h2>
                      La pausa que
                      <br />
                      <em>nos pone en juego.</em>
                    </h2>
                    <p>
                      Cuatro compañeros, dos equipos.
                      <br />Y una buena excusa para volver a encontrarnos.
                    </p>
                    <button
                      onClick={() => navigate("rankings")}
                      className="hero-link"
                    >
                      Así va la liga <ArrowRight size={17} />
                    </button>
                  </div>
                  <FoosballVisual />
                  <div className="hero-club-tag">
                    <img
                      src="/brand/liga-cordoba-logo.svg"
                      alt=""
                      width="30"
                      height="30"
                    />
                    <span>
                      HUMAN MOTION.
                      <br />
                      <strong>TEAM EMOTION.</strong>
                    </span>
                  </div>
                </section>
                <section className="panel leader-card">
                  <div className="card-kicker">
                    <span className="eyebrow">EN LO MÁS ALTO</span>
                    <Trophy size={19} />
                  </div>
                  {competitive[0] ? (
                    <>
                      <div className="leader-avatar">
                        <Avatar player={competitive[0].player} size="large" />
                        <span>01</span>
                      </div>
                      <h2>{competitive[0].player.name}</h2>
                      <span className="leader-label">
                        LÍDER DE LA CLASIFICACIÓN
                      </span>
                      <div className="leader-stats">
                        <div>
                          <strong>{pct(competitive[0].adjusted)}</strong>
                          <small>% AJUSTADO</small>
                        </div>
                        <div>
                          <strong>
                            {competitive[0].wins}
                            <span>/{competitive[0].games}</span>
                          </strong>
                          <small>VICTORIAS / PJ</small>
                        </div>
                      </div>
                      <button
                        className="leader-profile"
                        onClick={() => showPlayer(competitive[0].player.id)}
                      >
                        Ver perfil del jugador
                        <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <Empty title="El liderato te espera">
                      Se necesitan {rules.minimum} partidos reales para
                      competir.
                    </Empty>
                  )}
                </section>
              </div>
              <div className="stats-strip">
                <div>
                  <span>PARTIDAS DISPUTADAS</span>
                  <strong>
                    {String(valid.length).padStart(2, "0")}
                    <small> partidos</small>
                  </strong>
                </div>
                <div>
                  <span>JUGADORES EN LA LIGA</span>
                  <strong>
                    {data.players.filter((p) => p.active).length}
                    <small> en activo</small>
                  </strong>
                </div>
                <div>
                  <span>EN COMPETICIÓN</span>
                  <strong>
                    {competitive.length}
                    <small> clasificados</small>
                  </strong>
                </div>
                <div>
                  <span>A VUESTRO RITMO</span>
                  <strong>
                    2 o 3<small> goles habitualmente · Tú eliges</small>
                  </strong>
                </div>
              </div>
              <div className="dashboard-grid">
                <div>
                  <SectionTitle title="La clasificación">
                    <LinkButton onClick={() => navigate("rankings")}>
                      Ver todos
                    </LinkButton>
                  </SectionTitle>
                  <div className="panel">
                    <div className="panel-subtitle">
                      <span className="chip gold-chip">GENERAL</span>
                      <span>El porcentaje ajustado decide.</span>
                    </div>
                    <RankTable
                      rows={rows.filter((x) => x.games > 0).slice(0, 5)}
                      compact
                      onPlayer={showPlayer}
                    />
                  </div>
                  <p className="ranking-caption">
                    Mínimo {rules.minimum} partidos para entrar en competición.
                    Cada resultado cuenta.
                  </p>
                </div>
                <div>
                  <SectionTitle title="La última partida">
                    <span className="chip">
                      {last ? "FINAL" : "POR ESTRENAR"}
                    </span>
                  </SectionTitle>
                  <div className="panel latest-result">
                    {last ? (
                      <Result match={last} players={data.players} />
                    ) : (
                      <Empty />
                    )}
                    <button
                      className="leader-profile"
                      onClick={() => navigate("history")}
                    >
                      Ver historial completo
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="next-match-card">
                    <span>¿REVANCHA?</span>
                    <strong>La siguiente la decides tú.</strong>
                    <button
                      onClick={newMatch}
                      aria-label="Registrar una nueva partida"
                    >
                      <Plus size={21} />
                    </button>
                  </div>
                </div>
              </div>
              <SectionTitle title="Cada posición, su especialista">
                <LinkButton onClick={() => navigate("rankings")}>
                  Todos los rankings
                </LinkButton>
              </SectionTitle>
              <div className="specialist-grid">
                {[
                  [defender, "El muro de la liga", "Mejor defensa", Shield],
                  [forward, "El gol tiene nombre", "Mejor delantero", Swords],
                ].map(([s, title, label, Icon]) => {
                  const stat = s as typeof defender;
                  const I = Icon as typeof Shield;
                  return (
                    <article className="panel specialist" key={String(label)}>
                      <div className="specialist-icon">
                        <I size={22} />
                      </div>
                      <div>
                        <span className="eyebrow">{String(label)}</span>
                        <h3>{stat?.player.name || "Por decidir"}</h3>
                        <p>
                          {String(title)}
                          {stat ? ` · ${stat.games} PJ` : ""}
                        </p>
                      </div>
                      <strong>{stat ? pct(stat.adjusted) : "—"}</strong>
                    </article>
                  );
                })}
                <article className="panel specialist pair-specialist">
                  <div className="specialist-icon">
                    <Users size={22} />
                  </div>
                  <div>
                    <span className="eyebrow">La conexión perfecta</span>
                    <h3>
                      {pair
                        ? pair.names.map((n) => n.split(" ")[0]).join(" + ")
                        : "Por decidir"}
                    </h3>
                    <p>
                      {pair
                        ? `${pair.games} partidos juntos`
                        : `Mínimo ${rules.pair_minimum} partidos juntos`}
                    </p>
                  </div>
                  <strong>{pair ? pct(pair.adjusted) : "—"}</strong>
                </article>
              </div>
            </>
          )}
          {page === "rankings" && (
            <Rankings
              players={data.players}
              matches={matches}
              rules={rules}
              onPlayer={showPlayer}
            />
          )}
          {page === "players" && (
            <Players
              players={data.players}
              matches={matches}
              rules={rules}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {page === "history" && (
            <History
              matches={matches}
              players={data.players}
              seasons={data.seasons}
              admin={data.role === "admin"}
              onEdit={(m) => {
                setEdit(m);
                setMatchForm(true);
              }}
              onVoid={(m) => {
                setVoidMatch(m);
                setReason("");
              }}
            />
          )}
          {page === "admin" && data.role === "admin" && (
            <Admin data={data} demo={demo} command={league.admin} />
          )}
          <footer className="content-footer">
            <span>
              FUTABLE <i /> HECHO PARA COMPARTIR EL JUEGO
            </span>
            <span>
              {demo
                ? "Datos de demostración"
                : synced
                  ? `Última consulta · ${synced.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                  : "Sin sincronizar"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav">
        {nav.map(([key, label, Icon], i) => (
          <button
            key={key}
            className={page === key ? "active" : ""}
            onClick={() => navigate(key)}
          >
            {i === 2 && <span className="nav-gap" />}
            <Icon size={21} />
            <span>{i === 1 ? "Rankings" : label}</span>
          </button>
        ))}
        <button
          className="mobile-add"
          onClick={newMatch}
          aria-label="Nueva partida"
          disabled={!online}
        >
          <Plus size={25} />
        </button>
      </nav>
      {myProfile && ownPlayer && (
        <MyProfile
          player={ownPlayer}
          demo={demo}
          online={online}
          onClose={() => setMyProfile(false)}
          onLogout={async () => {
            setMyProfile(false);
            await league.logout();
          }}
          onSave={async (name, photo) => {
            await league.saveProfile(name, photo);
            setNotice(
              demo
                ? "Perfil actualizado en la demostración. Los cambios son temporales."
                : "Perfil guardado. Tu historial y tus estadísticas se conservan.",
            );
          }}
        />
      )}
      {matchForm && active && (
        <MatchForm
          players={data.players}
          season={active}
          last={data.matches.find(
            (m) => m.status === "valid" && m.season_id === active.id,
          )}
          edit={edit}
          onClose={() => setMatchForm(false)}
          onSave={async (input, existing, why) => {
            await league.save(input, existing, why);
            setNotice(
              demo
                ? "Partida añadida a la demostración. Los cambios se pierden al salir."
                : "Partida guardada y confirmada por el servidor.",
            );
          }}
        />
      )}
      {voidMatch && (
        <Modal
          title="Anular partida"
          onClose={() => {
            if (!voidBusy) setVoidMatch(null);
          }}
        >
          <p>
            La partida dejará de computar, pero seguirá en el historial y la
            auditoría.
          </p>
          <label className="field">
            Motivo
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
            />
          </label>
          <button
            disabled={voidBusy || reason.trim().length < 3}
            className="primary full"
            onClick={async () => {
              setVoidBusy(true);
              try {
                await league.admin("match.void", {
                  id: voidMatch.id,
                  revision: voidMatch.revision,
                  reason,
                });
                setVoidMatch(null);
                setNotice("Partida anulada.");
              } catch (e) {
                setNotice((e as Error).message);
              } finally {
                setVoidBusy(false);
              }
            }}
          >
            {voidBusy ? "Anulando…" : "Confirmar anulación"}
          </button>
        </Modal>
      )}
      {help && (
        <Modal
          title="El mérito está en cómo juegas"
          onClose={() => setHelp(false)}
        >
          <p>
            La clasificación premia el rendimiento relativo y mantiene el tamaño
            de muestra visible.
          </p>
          <div className="help-formula">
            (Victorias + {rules.prior_wins}) ÷ (Partidos + {rules.prior_games})
            × 100
          </div>
          <p>
            Debes jugar {rules.minimum} partidos reales para clasificar. Defensa
            y delantero cuentan solo las partidas en esa posición. El jugador
            completo necesita {rules.minimum} en cada una.
          </p>
          <p>
            Se desempata por porcentaje real, partidos, victorias y nombre, sin
            redondear los valores. Las parejas necesitan {rules.pair_minimum}{" "}
            partidas conjuntas, con independencia de sus posiciones.
          </p>
          <h3>Llévala en el móvil</h3>
          <p>
            El botón de ayuda de la cabecera explica cómo instalar FutABLE en
            Android y iPhone.
          </p>
          <p className="muted">
            Con conexión se recuperan los datos al volver a la app y cada 30
            segundos, además de las actualizaciones Realtime. Sin conexión
            puedes consultar esta sesión, pero no confirmar partidas.
          </p>
        </Modal>
      )}
    </div>
  );
}
