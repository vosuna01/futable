/** Seasons end at the end of their final calendar day in Europe/Madrid. */
export function seasonDeadline(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const midnight = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight.getTime()) ||
    midnight.toISOString().slice(0, 10) !== date
  )
    return NaN;
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  // Madrid is one or two hours ahead of UTC; read the offset at midnight,
  // before the 02:00/03:00 daylight-saving transition, rather than on the PC.
  const offset = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(midnight),
  );
  return midnight.getTime() - offset * 3_600_000;
}
export function countdownParts(deadline: number, now: number) {
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    finished: total === 0,
  };
}
