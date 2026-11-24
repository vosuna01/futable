import { WHATS_NEW } from "../whats-new";
import { Modal } from "./ui";
import "../whats-new.css";

/** Ventana de novedades tras actualizar la app. */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={WHATS_NEW.title} onClose={onClose}>
      <ul className="whats-new">
        {WHATS_NEW.items.map((item) => (
          <li key={item.title}>
            <span className="whats-new-icon" aria-hidden="true">
              {item.icon}
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button className="primary" onClick={onClose}>
          ¡Entendido!
        </button>
      </div>
    </Modal>
  );
}
