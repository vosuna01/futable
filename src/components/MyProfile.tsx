import { useRef, useState, type FormEvent } from "react";
import { Camera, LogOut } from "lucide-react";
import type { Player } from "../domain/types";
import { prepareProfilePhoto } from "../data/profile-photo";
import { Avatar, Modal } from "./ui";

export function MyProfile({
  player,
  demo,
  online,
  onSave,
  onClose,
  onLogout,
}: {
  player: Player;
  demo: boolean;
  online: boolean;
  onSave: (name: string, photo: string | null) => Promise<void>;
  onClose: () => void;
  onLogout: () => Promise<void>;
}) {
  const [name, setName] = useState(player.name);
  const [photo, setPhoto] = useState(player.avatar_url);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const photoRequest = useRef(0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || preparing) return;
    if (!name.trim()) {
      setError("Escribe tu nombre o apodo.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(name.trim(), photo);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Mi perfil"
      onClose={() => {
        if (!busy && !preparing) onClose();
      }}
    >
      <form className="my-profile" onSubmit={submit}>
        <p className="muted">
          Así te verán tus compañeros en la liga. Tus partidas y estadísticas
          siguen contigo.
        </p>
        {demo && (
          <p className="rule-note">
            Demostración: los cambios son temporales y se pierden al salir.
          </p>
        )}
        <div className="profile-photo-preview">
          <Avatar player={{ name, avatar_url: photo }} size="large" />
        </div>
        <label className="field">
          Foto de perfil
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || preparing}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const request = ++photoRequest.current;
              setPreparing(true);
              setError("");
              try {
                const result = await prepareProfilePhoto(file);
                if (request === photoRequest.current) setPhoto(result);
              } catch (e) {
                if (request === photoRequest.current)
                  setError((e as Error).message);
              } finally {
                if (request === photoRequest.current) setPreparing(false);
              }
            }}
          />
        </label>
        <p className="rule-note">
          <Camera size={14} /> JPG, PNG o WebP · Hasta 10 MB · Recorte cuadrado
          centrado
        </p>
        {photo && (
          <button
            type="button"
            className="text-button"
            disabled={busy || preparing}
            onClick={() => setPhoto(null)}
          >
            Quitar foto
          </button>
        )}
        <label className="field">
          Nombre o apodo
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            disabled={busy}
            autoComplete="nickname"
          />
        </label>
        <p className="rule-note">
          La foto y el nombre se guardan al pulsar «Guardar cambios».
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!online && (
          <p className="error">Necesitas conexión para guardar tu perfil.</p>
        )}
        <button
          className="primary full"
          type="submit"
          disabled={busy || preparing || !online}
        >
          {preparing
            ? "Preparando foto…"
            : busy
              ? "Guardando perfil…"
              : "Guardar cambios"}
        </button>
        <button
          type="button"
          className="text-button profile-logout"
          disabled={busy || preparing}
          onClick={() => void onLogout()}
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </form>
    </Modal>
  );
}
