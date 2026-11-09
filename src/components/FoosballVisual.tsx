import { appUrl } from "../domain/app-url";
export function FoosballVisual({
  variant = "home",
}: {
  variant?: "home" | "auth";
}) {
  return (
    <figure className={`foosball-visual foosball-${variant}`}>
      <div className="table-halo" aria-hidden="true" />
      <span className="visual-orbit orbit-one" aria-hidden="true" />
      <span className="visual-orbit orbit-two" aria-hidden="true" />
      <img
        className="foosball-table"
        src={appUrl("visuals/foosball-table.png")}
        alt="Ilustración de un futbolín de madera con patas, barras y jugadores azules y rojos"
        width="1536"
        height="1024"
        fetchPriority="high"
      />
      <figcaption>
        <span className="table-caption-dot" />
        FUTBOLÍN CATALÁN<span>CÓRDOBA · 2 vs 2</span>
      </figcaption>
    </figure>
  );
}
