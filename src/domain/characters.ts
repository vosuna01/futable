import type { Player } from "./types";
export interface CharacterAsset {
  playerId: string;
  file: string;
  head: number;
  name: string;
}
/** Stable IDs: a profile rename never changes the character's identity. */
export const CHARACTER_ASSETS: Readonly<Record<string, CharacterAsset>> = {
  "c829a86c-97a4-49e6-a8b3-481ef20feb81": {
    playerId: "c829a86c-97a4-49e6-a8b3-481ef20feb81",
    file: "victor-fbf3ba64.webp",
    head: 205,
    name: "Víctor",
  },
  "3a83bc45-af34-47be-b098-cd06e87f6d95": {
    playerId: "3a83bc45-af34-47be-b098-cd06e87f6d95",
    file: "adri-9bd6ab3b.webp",
    head: 202,
    name: "Adri",
  },
  "b87454e8-3c75-4500-80f8-513c71b219fe": {
    playerId: "b87454e8-3c75-4500-80f8-513c71b219fe",
    file: "sergi-d90c73b4.webp",
    head: 202,
    name: "Sergi",
  },
  "7d962eae-f944-48d6-a10a-a591a9258e5d": {
    playerId: "7d962eae-f944-48d6-a10a-a591a9258e5d",
    file: "pablo-689ed720.webp",
    head: 202,
    name: "Pablo",
  },
  "aa3f52dd-00a8-431b-94c8-e50bc2c20432": {
    playerId: "aa3f52dd-00a8-431b-94c8-e50bc2c20432",
    file: "marc-b-00fc13d5.webp",
    head: 202,
    name: "Marc.B",
  },
  "884ac43c-067b-4c16-a5ff-84c4bc6830e4": {
    playerId: "884ac43c-067b-4c16-a5ff-84c4bc6830e4",
    file: "jo-c0be6c02.webp",
    head: 202,
    name: "Jo",
  },
  "084dfc87-2091-47ef-b0c3-cf42a8a417a8": {
    playerId: "084dfc87-2091-47ef-b0c3-cf42a8a417a8",
    file: "policcio-c467f5d3.webp",
    head: 202,
    name: "Policcio",
  },
  "ad2f088d-7508-48a6-88b2-5920f954a58b": {
    playerId: "ad2f088d-7508-48a6-88b2-5920f954a58b",
    file: "boni-0a2a9dc9.webp",
    head: 202,
    name: "Boni",
  },
  "f46c651c-3661-4b5e-afdb-633242f21634": {
    playerId: "f46c651c-3661-4b5e-afdb-633242f21634",
    file: "carballo-018feb1d.webp",
    head: 202,
    name: "Carballo",
  },
  "a1398844-d9ed-44de-ac4b-e8e385e4553b": {
    playerId: "a1398844-d9ed-44de-ac4b-e8e385e4553b",
    file: "oderrebote-1210b49d.webp",
    head: 202,
    name: "Oderrebote",
  },
  "bdfe1685-9722-49b7-9ebe-07f1dc329a07": {
    playerId: "bdfe1685-9722-49b7-9ebe-07f1dc329a07",
    file: "marcos-37cd25c0.webp",
    head: 202,
    name: "Marcos",
  },
  "82ecd33d-e244-496c-8361-04acb8356aab": {
    playerId: "82ecd33d-e244-496c-8361-04acb8356aab",
    file: "masip-5e6016d0.webp",
    head: 202,
    name: "Masip",
  },
};
export const characterFor = (player?: Pick<Player, "id">) =>
  player ? CHARACTER_ASSETS[player.id] : undefined;
export type CharacterMood = "idle" | "goal" | "victory";
/** Cells: neutral, blink, smile, grin, cheer, laugh. */
export function characterExpression(
  ms: number,
  mood: CharacterMood,
  reduced = false,
) {
  if (reduced) return mood === "idle" ? 2 : 3;
  if (mood === "goal") return ms < 240 ? 4 : ms < 1000 ? 5 : ms < 1750 ? 3 : 2;
  if (mood === "victory" && ms % 4600 < 1500) return ms % 4600 < 550 ? 4 : 5;
  return ms % 3900 > 3580 && ms % 3900 < 3750 ? 1 : 2;
}
