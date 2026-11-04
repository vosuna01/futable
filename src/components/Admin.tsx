import { useState, type FormEvent } from "react";
import { Download, Plus, Settings2, ShieldCheck, Users } from "lucide-react";
import type { Player, Snapshot } from "../domain/types";
import { Avatar, date, Modal } from "./ui";
type AdminCall = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<void>;
export function Admin({
  data,
  demo,
  command,
}: {
  data: Snapshot;
  demo: boolean;
  command: AdminCall;
}) {
  const [dialog, setDialog] = useState<
      "player" | "account" | "season" | "rules" | "close" | null
    >(null),
    [edit, setEdit] = useState<Player | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const active = data.seasons.find((s) => s.status === "active");
  function open(d: typeof dialog, p?: Player) {
    setEdit(p || null);
    setError("");
    setNotice("");
    setDialog(d);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const fields = Object.fromEntries(fd.entries());
    let action = "",
      payload: Record<string, unknown> = {};
    if (dialog === "player") {
      action = "player.save";
      payload = {
        ...fields,
        id: edit?.id || null,
        active: fd.get("active") === "on",
      };
    }
    if (dialog === "account") {
      action = "membership.save";
      payload = { ...fields, active: fd.get("active") === "on" };
    }
    if (dialog === "season") {
      action = "season.create";
      payload = fields;
    }
    if (dialog === "rules") {
      action = "season.configure";
      payload = {
        id: active?.id,
        ...Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, Number(v)]),
        ),
      };
    }
    if (dialog === "close") {
      if (fields.confirm !== active?.name) {
        setError("Escribe el nombre exacto de la temporada.");
        return;
      }
      action = "season.close";
      payload = { id: active?.id };
    }
    setBusy(true);
    try {
      await command(action, payload);
      setDialog(null);
      setNotice("Cambios guardados.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...data, exported_at: new Date().toISOString() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `futable-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="page-intro">
        <span className="eyebrow">TODO EN SU SITIO</span>
        <h1>
          Tu liga, al día<span>.</span>
        </h1>
        <p>Jugadores, permisos, temporadas y reglas de competición.</p>
      </div>
      {demo && (
        <div className="info-note">
          <ShieldCheck size={20} />
          <p>
            Demostración: puedes explorar estas opciones. Los cambios
            administrativos requieren una conexión real con Supabase.
          </p>
        </div>
      )}
      {notice && (
        <p role="status" className="confirmation">
          {notice}
        </p>
      )}
      <div className="admin-grid">
        <section className="panel admin-section">
          <div className="panel-heading">
            <h2>
              <Users size={18} /> Jugadores
            </h2>
            <button className="text-button" onClick={() => open("player")}>
              <Plus size={16} /> Añadir
            </button>
          </div>
          {data.players.map((p) => (
            <div className="admin-row" key={p.id}>
              <Avatar player={p} size="small" />
              <span>
                {p.name}
                <small>{p.active ? "Activo" : "Inactivo"}</small>
              </span>
              <button className="text-button" onClick={() => open("player", p)}>
                Editar
              </button>
            </div>
          ))}
        </section>
        <div className="admin-stack">
          <section className="panel admin-section">
            <div className="panel-heading">
              <h2>
                <Settings2 size={18} /> Temporadas
              </h2>
              {!active && (
                <button className="text-button" onClick={() => open("season")}>
                  Crear
                </button>
              )}
            </div>
            {data.seasons.map((s) => (
              <div className="season-row" key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.starts_at} → {s.ends_at || "en curso"}
                  </small>
                </div>
                <span
                  className={`chip ${s.status === "active" ? "green" : ""}`}
                >
                  {s.status === "active" ? "Activa" : "Cerrada"}
                </span>
              </div>
            ))}
            {active && (
              <>
                <p className="muted small">
                  Mínimo {active.minimum} PJ · Ajuste {active.prior_wins}/
                  {active.prior_games} · Parejas {active.pair_minimum} PJ ·
                  Goles variables · Inicio sugerido: {active.target}
                </p>
                <div className="button-row">
                  <button className="secondary" onClick={() => open("rules")}>
                    Configurar reglas
                  </button>
                  <button className="secondary" onClick={() => open("close")}>
                    Cerrar temporada
                  </button>
                </div>
              </>
            )}
          </section>
          <section className="panel admin-section">
            <div className="panel-heading">
              <h2>
                <ShieldCheck size={18} /> Cuentas autorizadas
              </h2>
              <button className="text-button" onClick={() => open("account")}>
                Gestionar
              </button>
            </div>
            <p className="muted small">
              Cada persona puede crear su cuenta desde el acceso. Utiliza su
              UUID para cambiar permisos o revocar su acceso.
            </p>
            {data.memberships.map((m) => (
              <div className="admin-row" key={m.user_id}>
                <div>
                  <strong>{m.display_name}</strong>
                  <small className="uuid">{m.user_id}</small>
                </div>
                <span className="chip">
                  {m.active
                    ? m.role === "admin"
                      ? "Admin"
                      : "Jugador"
                    : "Revocada"}
                </span>
              </div>
            ))}
          </section>
          <button className="secondary full" onClick={exportData}>
            <Download size={17} /> Exportar datos de la liga (JSON)
          </button>
        </div>
      </div>
      <section className="panel admin-section mt">
        <h2>Auditoría</h2>
        <p className="muted small">
          Últimas 200 operaciones · Los registros completos permanecen en
          PostgreSQL.
        </p>
        {data.audit.length ? (
          data.audit.map((a) => (
            <details key={a.id} className="audit-row">
              <summary>
                <span>{a.action}</span>
                <small>{date(a.created_at)}</small>
              </summary>
              <p className="muted small">
                Autor: {a.actor_id} · Entidad: {a.entity_id}
              </p>
              <pre>
                {JSON.stringify(
                  { antes: a.before_data, después: a.after_data },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))
        ) : (
          <p className="muted">Todavía no hay operaciones registradas.</p>
        )}
      </section>
      {dialog && (
        <Modal
          title={
            dialog === "player"
              ? edit
                ? "Editar jugador"
                : "Nuevo jugador"
              : dialog === "account"
                ? "Gestionar acceso"
                : dialog === "season"
                  ? "Nueva temporada"
                  : dialog === "close"
                    ? "Cerrar temporada"
                    : "Reglas de la temporada"
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          <form onSubmit={(e) => void submit(e)}>
            {dialog === "player" && (
              <>
                <label className="field">
                  Nombre o apodo
                  <input
                    name="name"
                    required
                    maxLength={60}
                    defaultValue={edit?.name}
                  />
                </label>
                <label className="field">
                  Avatar (URL HTTPS, opcional)
                  <input
                    name="avatar_url"
                    type="url"
                    pattern="https://.*"
                    defaultValue={edit?.avatar_url || ""}
                  />
                </label>
                <label className="checkbox">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={edit?.active ?? true}
                  />{" "}
                  Jugador activo
                </label>
              </>
            )}
            {dialog === "account" && (
              <>
                <p className="muted">
                  Usa el UUID de una cuenta registrada en Supabase. Para cambiar
                  o revocar un acceso, utiliza su mismo UUID.
                </p>
                <label className="field">
                  UUID de usuario
                  <input name="user_id" required pattern="[0-9a-fA-F-]{36}" />
                </label>
                <label className="field">
                  Nombre visible
                  <input name="display_name" required maxLength={60} />
                </label>
                <label className="field">
                  Permisos
                  <select name="role">
                    <option value="player">Jugador autorizado</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="active" defaultChecked /> Acceso
                  activo
                </label>
              </>
            )}
            {dialog === "season" && (
              <>
                <label className="field">
                  Nombre
                  <input name="name" required maxLength={80} />
                </label>
                <label className="field">
                  Fecha de inicio
                  <input
                    name="starts_at"
                    type="date"
                    required
                    defaultValue={new Date().toLocaleDateString("en-CA")}
                  />
                </label>
              </>
            )}
            {dialog === "rules" && active && (
              <>
                {(
                  [
                    ["minimum", "Mínimo de partidos", 1],
                    ["prior_wins", "Victorias virtuales", 0],
                    ["prior_games", "Partidas virtuales", 1],
                    ["pair_minimum", "Mínimo de partidas por pareja", 1],
                    [
                      "target",
                      "Marcador inicial sugerido (editable por partida)",
                      1,
                    ],
                  ] as const
                ).map(([key, label, min]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      name={key}
                      type="number"
                      min={min}
                      max={key === "target" ? 99 : undefined}
                      required
                      defaultValue={active[key]}
                    />
                  </label>
                ))}
                <p className="muted small">
                  Las victorias virtuales no pueden superar las partidas
                  virtuales. Los cambios recalculan la clasificación de esta
                  temporada.
                </p>
              </>
            )}
            {dialog === "close" && (
              <>
                <p>
                  Se conservarán los resultados y las reglas para reconstruir la
                  clasificación final. La temporada cerrada quedará bloqueada
                  para nuevas partidas y correcciones.
                </p>
                <label className="field">
                  Escribe «{active?.name}» para confirmar
                  <input name="confirm" required autoComplete="off" />
                </label>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
