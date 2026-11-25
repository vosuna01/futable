/**
 * «Novedades» que se enseñan una vez después de pulsar «Actualizar
 * aplicación». En cada publicación con cambios visibles: cambia `id` y
 * reescribe los puntos (máximo 5-6, que se lean en menos de un minuto).
 */
export const WHATS_NEW = {
  id: "2026-11-25-sesion",
  title: "Novedades de FutABLE",
  items: [
    {
      icon: "📊",
      title: "Mi sesión actual",
      text: "Botón en la partida en directo con tus partidas, victorias, derrotas, goles y el MMR que llevas ganado hoy, más la tabla del día.",
    },
    {
      icon: "🕑",
      title: "Tu última sesión",
      text: "Al cerrar la sesión, el mismo resumen queda en Inicio hasta que empiece otra.",
    },
    {
      icon: "📈",
      title: "MMR en tu ficha",
      text: "El MMR de cada partida ya aparece también en tu perfil y en la última partida de Inicio, no solo en el historial.",
    },
    {
      icon: "🧹",
      title: "Pantallas más limpias",
      text: "Menos texto de relleno en Inicio, Clasificaciones, Jugadores, Historial y el directo.",
    },
    {
      icon: "🗂️",
      title: "Categorías a la vista",
      text: "En Clasificaciones ya no hay que deslizar: se ven todas de una.",
    },
    {
      icon: "✍️",
      title: "Registrar a mano",
      text: "Apuntar una partida suelta pasa a Administración. Lo normal sigue siendo el directo.",
    },
  ],
} as const;

const UPDATED_KEY = "futable:updated";
const SEEN_KEY = "futable:whats-new-seen";

type Storage = Pick<
  globalThis.Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
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

/** Quien ya usaba la app tiene una sesión de Supabase guardada. */
function hasUsedApp(storage: Storage) {
  for (let i = 0; i < storage.length; i++)
    if (/^sb-.+-auth-token$/.test(storage.key(i) ?? "")) return true;
  return false;
}

/**
 * ¿Hay que enseñar las novedades? Si estas notas no se han visto y quien abre
 * la app ya la usaba: tras pulsar «Actualizar» o al abrir una versión nueva
 * (la PWA también se actualiza sola al cerrarla y volverla a abrir). Una
 * visita nueva no las ve: se dan por vistas.
 */
export function shouldShowWhatsNew(storage: Storage | null = store()) {
  try {
    if (!storage) return false;
    if (storage.getItem(SEEN_KEY) === WHATS_NEW.id) {
      storage.removeItem(UPDATED_KEY);
      return false;
    }
    if (storage.getItem(UPDATED_KEY) === "1" || hasUsedApp(storage))
      return true;
    storage.setItem(SEEN_KEY, WHATS_NEW.id);
    return false;
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
