import { expect, it } from "vitest";
import { createDemo } from "../src/demo/data";
import { awardSuggestions } from "../src/domain/coins";
import type { Match } from "../src/domain/types";

it("awards credited goals and the lowest defensive rate using eligible matches", () => {
  const data = createDemo();
  const season = { ...data.seasons[0], minimum: 2 };
  const [defender, forward, opponent, striker, substitute] = data.players;
  const match: Match = {
    ...data.matches[0],
    season_id: season.id,
    status: "valid",
    winner: "red",
    red_score: 3,
    blue_score: 0,
    participants: [
      { player_id: defender.id, team: "red", position: "defender" },
      { player_id: forward.id, team: "red", position: "forward" },
      { player_id: opponent.id, team: "blue", position: "defender" },
      { player_id: striker.id, team: "blue", position: "forward" },
    ],
    scorers: [
      { player_id: forward.id, goals: 2 },
      { player_id: defender.id, goals: 1 },
    ],
  };
  data.matches = [
    { ...match, id: "first" },
    {
      ...match,
      id: "second",
      red_score: 4,
      blue_score: 3,
      scorers: [{ player_id: striker.id, goals: 2 }],
    },
    {
      ...match,
      id: "sub",
      participants: [
        { player_id: substitute.id, team: "red", position: "defender" },
      ],
    },
    { ...match, id: "unknown", red_score: null, blue_score: null, scorers: [] },
    {
      ...match,
      id: "void",
      status: "void",
      scorers: [{ player_id: opponent.id, goals: 8 }],
    },
  ];
  const closed = {
    ...season,
    status: "closed" as const,
    final_results: {
      rules: season,
      matches: data.matches.map(({ scorers: _omitted, ...saved }) => saved),
    },
  };
  const awards = awardSuggestions(data, closed, []);
  expect(
    awards.find((award) => award.title === "Bota de Oro")?.players,
  ).toEqual(expect.arrayContaining([forward.id, striker.id]));
  expect(
    awards.find((award) => award.title === "Bota de Oro")?.players,
  ).toHaveLength(2);
  expect(awards.find((award) => award.title === "Guante de Oro")).toMatchObject(
    {
      players: [defender.id],
      detail: "1,5 goles encajados por partido",
    },
  );
});
