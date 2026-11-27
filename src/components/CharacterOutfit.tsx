import { useId } from "react";
import type { Player } from "../domain/types";
import { PlayerCharacter } from "./PlayerCharacter";
import type { CharacterMood } from "../domain/characters";
export function AccessoryArt({ items }: { items: string[] }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className="character-accessories"
      viewBox="0 0 272 512"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id + "gold"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff2bd" />
          <stop offset=".4" stopColor="#dbab3c" />
          <stop offset=".75" stopColor="#ffdd7e" />
          <stop offset="1" stopColor="#ad751d" />
        </linearGradient>
      </defs>
      {items.includes("aura") && (
        <g className="accessory-aura" fill="none" stroke="#6bd7a7">
          <ellipse
            cx="136"
            cy="300"
            rx="118"
            ry="192"
            opacity=".22"
            strokeWidth="5"
          />
          <ellipse
            cx="136"
            cy="300"
            rx="110"
            ry="183"
            opacity=".4"
            strokeWidth="2"
          />
        </g>
      )}
      {items.includes("gold-base") && (
        <g>
          <ellipse cx="136" cy="498" rx="100" ry="12" fill="#21193c22" />
          <path
            d="M50 478Q136 451 222 478V492Q136 518 50 492Z"
            fill={`url(#${id}gold)`}
          />
          <ellipse cx="136" cy="478" rx="86" ry="15" fill="#fae4a4" />
        </g>
      )}
      {items.includes("cap") && (
        <g>
          <path
            d="M77 56Q81 1 136 2Q191 2 198 57Z"
            fill="#1da099"
            stroke="#116960"
            strokeWidth="3"
          />
          <path
            d="M90 48Q153 36 211 57Q221 71 200 75L130 62Z"
            fill="#127b76"
            stroke="#0c5955"
            strokeWidth="3"
          />
          <path
            d="M127 14L115 39M127 14L142 37M119 31H137"
            fill="none"
            stroke="#f4fff5"
            strokeWidth="5"
          />
        </g>
      )}
      {items.includes("crown") && (
        <g fill={`url(#${id}gold)`} stroke="#a87528" strokeWidth="2">
          <path d="M76 25L96 45L117 9L137 38L159 7L179 43L201 24L187 68Q136 80 88 67Z" />
          <path d="M88 63Q136 72 187 64L185 77Q137 88 90 77Z" />
          <circle cx="137" cy="57" r="5" fill="#1da099" />
        </g>
      )}
      {items.includes("glasses") && (
        <g stroke="#d3ad57" strokeWidth="4" fill="#17122bec">
          <path
            d="M76 96L69 91M196 96L204 90M126 102Q136 94 146 102"
            fill="none"
          />
          <path d="M78 92Q100 85 125 93L122 116Q100 132 82 116Z" />
          <path d="M147 93Q172 85 194 92L190 116Q170 132 150 116Z" />
          <path
            d="M88 97L105 94M156 97L173 94"
            stroke="#ffffff77"
            strokeWidth="2"
          />
        </g>
      )}
      {items.includes("spark") && (
        <g className="accessory-spark" fill="#e8bc58">
          {[
            [30, 180],
            [235, 230],
            [42, 350],
            [230, 110],
            [220, 410],
          ].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 10}l3 7 8 3-8 3-3 8-3-8-8-3 8-3Z`} />
          ))}
        </g>
      )}
    </svg>
  );
}
export function CharacterOutfit({
  player,
  items = [],
  mood = "idle",
  animate = true,
}: {
  player: Player;
  items?: string[];
  mood?: CharacterMood;
  animate?: boolean;
}) {
  return (
    <span className="character-outfit">
      <PlayerCharacter {...{ player, mood, animate }} />
      <AccessoryArt items={items} />
    </span>
  );
}
