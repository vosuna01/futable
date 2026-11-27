export type CosmeticSlot = "head" | "face" | "effect" | "base";
export const COSMETICS = [
  {
    id: "glasses",
    name: "Gafas Pro",
    slot: "face",
    cost: 40,
    description: "La mirada de quien viene a ganar.",
  },
  {
    id: "cap",
    name: "Gorra ABLE",
    slot: "head",
    cost: 80,
    description: "Tu club, tu estilo.",
  },
  {
    id: "crown",
    name: "Corona del Rey",
    slot: "head",
    cost: 150,
    description: "Para quien vive en la pista.",
  },
  {
    id: "aura",
    name: "Aura ABLE",
    slot: "effect",
    cost: 100,
    description: "Energía verde para entrar con presencia.",
  },
  {
    id: "spark",
    name: "Gol Estelar",
    slot: "effect",
    cost: 60,
    description: "Una celebración con luz propia.",
  },
  {
    id: "gold-base",
    name: "Base de Oro",
    slot: "base",
    cost: 120,
    description: "Un pedestal a la altura de tu personaje.",
  },
] as const;
export type CosmeticId = (typeof COSMETICS)[number]["id"];
export function tryCosmetic(items: string[], id: string) {
  const next = COSMETICS.find((i) => i.id === id);
  if (!next) return items;
  return [
    ...items.filter(
      (i) => COSMETICS.find((c) => c.id === i)?.slot !== next.slot,
    ),
    id,
  ];
}
export const classificationCoins = (wallet: {
  balance: number;
  score?: number;
}) => wallet.score ?? wallet.balance;
