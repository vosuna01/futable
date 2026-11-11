import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { countdownParts, seasonDeadline } from "../domain/season-deadline";

export function SeasonCountdown({ date }: { date: string }) {
  const [now, setNow] = useState(Date.now);
  const deadline = seasonDeadline(date);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [date]);
  if (!Number.isFinite(deadline)) return null;
  const parts = countdownParts(deadline, now);
  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section className="season-countdown" aria-label="Cierre de temporada">
      <div className="season-countdown-copy">
        <Flag size={22} aria-hidden="true" />
        <div>
          <span>CIERRE DE TEMPORADA</span>
          <strong>{dateLabel}</strong>
          <small>23:59 · hora de Madrid</small>
        </div>
      </div>
      {parts.finished ? (
        <p className="season-countdown-finished">
          Plazo finalizado · Pendiente del cierre de temporada
        </p>
      ) : (
        <div
          className="season-countdown-clock"
          role="timer"
          aria-live="off"
          aria-label={`Quedan ${parts.days} días, ${parts.hours} horas, ${parts.minutes} minutos y ${parts.seconds} segundos`}
        >
          {(
            [
              ["days", "días"],
              ["hours", "horas"],
              ["minutes", "min"],
              ["seconds", "seg"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <b>{String(parts[key]).padStart(2, "0")}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
