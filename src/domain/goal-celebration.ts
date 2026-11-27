import type { Team } from "./types";
type Goal = { team: Team; player: string | null };
/** Milestones count every credited goal, not only consecutive goals. */
export function goalCelebration(log: Goal[]) {
  const goal = log.at(-1);
  if (!goal) return null;
  let streak = 1;
  for (let i = log.length - 2; i >= 0; i--) {
    const p = log[i];
    if (p.team !== goal.team || p.player !== goal.player) break;
    streak++;
  }
  const teamGoals = log.filter((g) => g.team === goal.team).length;
  const scorerGoals = goal.player
    ? log.filter((g) => g.team === goal.team && g.player === goal.player).length
    : 0;
  const level = Math.min(
    4,
    Math.max(scorerGoals, streak, teamGoals >= 5 ? 3 : teamGoals >= 3 ? 2 : 1),
  );
  const title =
    scorerGoals >= 5
      ? "¡IMPARABLE!"
      : scorerGoals === 4
        ? "¡PÓKER!"
        : scorerGoals === 3
          ? "¡HAT-TRICK!"
          : scorerGoals === 2
            ? "¡DOBLETE!"
            : "¡GOOOL!";
  return {
    ...goal,
    streak,
    teamGoals,
    scorerGoals,
    level,
    title,
    duration: 2200 + 180 * (level - 1),
  };
}
