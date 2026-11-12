import { useState } from "react";
import { Search, X } from "lucide-react";
import type { Player } from "../domain/types";
import { matchesSearch } from "../domain/presentation";
import { Avatar } from "./ui";
export function PlayerPicker({
  players,
  disabled,
  onPick,
}: {
  players: Player[];
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const found = players
    .filter((p) => matchesSearch(p.name, query))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return (
    <div className="player-picker-search">
      <label className="search">
        <Search size={18} />
        <input
          type="search"
          aria-label="Buscar para fichar"
          placeholder="Nombre o apodo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Borrar búsqueda"
            onClick={() => setQuery("")}
          >
            <X size={16} />
          </button>
        )}
      </label>
      <p className="rule-note">
        {found.length}{" "}
        {found.length === 1 ? "jugador disponible" : "jugadores disponibles"}
      </p>
      <ul className="live-picker">
        {found.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(p.id)}
            >
              <Avatar player={p} size="small" />
              {p.name}
            </button>
          </li>
        ))}
      </ul>
      {!found.length && (
        <div className="search-empty">
          <strong>No encontramos a esa persona</strong>
          <p>Prueba otro nombre o apodo.</p>
          <button className="text-button" onClick={() => setQuery("")}>
            Ver todos los disponibles
          </button>
        </div>
      )}
    </div>
  );
}
