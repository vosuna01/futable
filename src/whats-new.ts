/**
 * «Novedades» que se enseñan una vez después de pulsar «Actualizar
 * aplicación». En cada publicación con cambios visibles: cambia `id` y
 * reescribe los puntos (máximo 5-6, que se lean en menos de un minuto).
 */
export const WHATS_NEW = {
  id: "2026-11-24-mmr",
  title: "Novedades de FutABLE",
  items: [
    {
      icon: "🏆",
      title: "Llega el MMR (beta)",
      text: "Nueva pestaña en Clasificaciones. Cada partida suma o resta según lo fuerte que fuera el rival. Lo verás también en tu ficha de jugador y en el historial.",
    },
    {
      icon: "📅",
      title: "Premio a la regularidad",
      text: "Se piden 40 partidas en los últimos 28 días. Cada una que falte resta 2 puntos al MMR que se muestra. Vuelve a jugar y se recupera.",
    },
    {
      icon: "⚡",
      title: "MMR en juego en directo",
      text: "Antes de cada partida verás cuánto MMR gana o pierde cada equipo, también en la tablet.",
    },
    {
      icon: "💰",
      title: "Cuotas según el MMR",
      text: "El pronóstico y las cuotas de las coins salen ahora del MMR. Las apuestas ya hechas no cambian.",
    },
    {
      icon: "🎲",
      title: "Equipos al azar",
      text: "En la primera partida de la sesión, los cuatro primeros de la cola se reparten al azar.",
    },
  ],
} as const;

const UPDATED_KEY = "futable:updated";
const SEEN_KEY = "futable:whats-new-seen";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Se llama justo antes de activar la versión nueva. */
export function markUpdating(storage: Storage | null = store()) {
  try {
    storage?.setItem(UPDATED_KEY, "1");
  } catch {
    // Sin almacenamiento la actualización sigue; solo no habrá novedades.
  }
}

/**
 * ¿Hay que enseñar las novedades? Solo tras pulsar «Actualizar» y si estas
 * notas no se han visto ya. Una instalación nueva no las enseña.
 */
export function shouldShowWhatsNew(storage: Storage | null = store()) {
  try {
    if (storage?.getItem(UPDATED_KEY) !== "1") return false;
    if (storage.getItem(SEEN_KEY) === WHATS_NEW.id) {
      storage.removeItem(UPDATED_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function markWhatsNewSeen(storage: Storage | null = store()) {
  try {
    storage?.setItem(SEEN_KEY, WHATS_NEW.id);
    storage?.removeItem(UPDATED_KEY);
  } catch {
    // Nada que hacer: se volvería a mostrar en la próxima actualización.
  }
}
