import {
  Award,
  Coins,
  Medal,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { trophyTitle, type Honours } from "../domain/coins";
import type { Player, Season } from "../domain/types";
import { Modal } from "./ui";

export function TrophyFigure({ title }: { title: string }) {
  if (title === "Bota de Oro" || title === "Guante de Oro")
    return (
      <svg
        className="trophy-figure silhouette"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        {title === "Bota de Oro" ? (
          <path d="M12 12h20l4 12 7 7 11 3c4 1 6 4 6 8v5H8V34l4-22Z M10 41h48 M27 23h10 M30 28h10 M34 33h10 M14 47v5h6v-5 M47 47v5h6v-5" />
        ) : (
          <path d="M23 54v-9L10 31a5 5 0 0 1 7-7l5 5V12a4 4 0 0 1 8 0v12V7a4 4 0 0 1 8 0v17V10a4 4 0 0 1 8 0v16V17a4 4 0 0 1 8 0v14c0 7-3 11-6 15v8H23Z M23 47h25 M28 40c2-5 7-8 13-8" />
        )}
      </svg>
    );
  const Icon =
    title === "Campeón de liga"
      ? Trophy
      : title === "Mejor defensa"
        ? Shield
        : title === "Mejor delantero"
          ? Swords
          : title === "Mejor pareja"
            ? Users
            : trophyTitle(title) === "Ludópata"
              ? Coins
              : /^(Subcampeón|Tercer puesto)/.test(title)
                ? Medal
                : Award;
  const metal =
    title === "Subcampeón de liga"
      ? " silver"
      : title === "Tercer puesto"
        ? " bronze"
        : "";
  return <Icon className={`trophy-figure${metal}`} aria-hidden="true" />;
}

export function TrophyCase({
  player,
  honours,
  seasons,
  unavailable,
  onClose,
}: {
  player: Player;
  honours: Honours[] | undefined;
  seasons: Season[];
  unavailable: boolean;
  onClose: () => void;
}) {
  const trophies = honours?.flatMap((season) =>
    season.awards.flatMap((award, index) =>
      award.players.some((winner) => winner.id === player.id)
        ? [
            {
              key: `${season.season_id}:${index}`,
              seasonId: season.season_id,
              title: award.title,
            },
          ]
        : [],
    ),
  );
  return (
    <Modal title={`Vitrina de ${player.name}`} onClose={onClose}>
      {!trophies ? (
        <p role="status">
          {unavailable
            ? "No se pudo cargar el palmarés. Vuelve a intentarlo con conexión."
            : "Cargando el palmarés…"}
        </p>
      ) : trophies.length ? (
        <div className="coin-awards">
          {trophies.map((trophy) => (
            <article key={trophy.key}>
              <TrophyFigure title={trophy.title} />
              <strong>{trophyTitle(trophy.title)}</strong>
              <span>
                {seasons.find((season) => season.id === trophy.seasonId)
                  ?.name ?? "Temporada"}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p>Cuando se publique un premio de {player.name}, aparecerá aquí.</p>
      )}
    </Modal>
  );
}
