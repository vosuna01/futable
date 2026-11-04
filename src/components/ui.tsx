import type { ReactNode } from "react";
import { X, Shield, ArrowUpRight } from "lucide-react";
import type { Player } from "../domain/types";
export const pct = (v: number) =>
  `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const date = (s: string) =>
  new Date(s).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Avatar({
  player,
  size = "normal",
}: {
  player: Pick<Player, "name" | "avatar_url">;
  size?: "normal" | "large" | "small";
}) {
  const n = player.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  const color =
    Array.from(player.name).reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
  return (
    <span className={`avatar avatar-${color} ${size}`}>
      {player.avatar_url ? (
        <img
          src={player.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span>{n}</span>
    </span>
  );
}
export function Logo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/brand/liga-cordoba-logo.svg" alt="" width="52" height="52" />
    </span>
  );
}
export function Empty({
  title = "Aún no hay resultados",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Shield size={30} />
      <h3>{title}</h3>
      <p>
        {children ||
          "Registra la primera partida y empieza a construir la liga."}
      </p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const els = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input,select,a[href]",
              ),
            );
            const first = els[0],
              last = els.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="eyebrow">FUTABLE</span>
            <h2>{title}</h2>
          </div>
          <button
            autoFocus
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function SectionTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={16} />
    </button>
  );
}
