import { appUrl } from "../domain/app-url";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleHelp,
  Smartphone,
  Share,
  MoreVertical,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import { Modal } from "./ui";

export function InstallHelp({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios">(() =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      ? "ios"
      : "android",
  );
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    <>
      <button
        type="button"
        className={
          compact ? "icon-button install-help-compact" : "install-help-button"
        }
        aria-label="Ayuda: instalar app"
        title="Cómo instalar FutABLE en Android o iPhone"
        onClick={() => setOpen(true)}
      >
        {compact ? (
          <CircleHelp size={19} />
        ) : (
          <>
            <Smartphone size={21} />
            <span>
              Instalar FutABLE en el móvil
              <small>Ayuda para Android y iPhone</small>
            </span>
            <ArrowUpRight size={18} />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <Modal title="Instalar FutABLE" onClose={() => setOpen(false)}>
            <div className="install-app-preview">
              <img
                src={appUrl("brand/liga-cordoba-logo.svg")}
                alt="Icono de FutABLE"
                width="64"
                height="64"
              />
              <div>
                <strong>FutABLE</strong>
                <span>Tu liga de futbolín, a un toque.</span>
              </div>
            </div>
            {installed && (
              <p className="confirmation">
                <CheckCircle2 size={18} /> Ya estás usando FutABLE como app.
              </p>
            )}
            <p>
              Guárdala en tu pantalla de inicio para abrirla con su propio
              icono. No necesitas descargarla de una tienda.
            </p>
            <div
              className="install-platforms"
              role="tablist"
              aria-label="Sistema del móvil"
            >
              <button
                role="tab"
                id="install-android-tab"
                aria-controls="install-steps"
                aria-selected={platform === "android"}
                onClick={() => setPlatform("android")}
              >
                Android
              </button>
              <button
                role="tab"
                id="install-ios-tab"
                aria-controls="install-steps"
                aria-selected={platform === "ios"}
                onClick={() => setPlatform("ios")}
              >
                iPhone / iPad
              </button>
            </div>
            <section
              id="install-steps"
              role="tabpanel"
              aria-labelledby={
                platform === "android"
                  ? "install-android-tab"
                  : "install-ios-tab"
              }
              className="install-steps"
            >
              <h3>
                {platform === "android"
                  ? "En Chrome para Android"
                  : "En Safari para iPhone o iPad"}
              </h3>
              {platform === "android" ? (
                <ol>
                  <li>
                    <strong>Abre esta web en Chrome.</strong>
                    <span>
                      Si vienes de WhatsApp, correo u otra app, abre el enlace
                      en el navegador.
                    </span>
                  </li>
                  <li>
                    <strong>
                      Pulsa el menú de los tres puntos{" "}
                      <MoreVertical size={14} />.
                    </strong>
                    <span>
                      Busca «Instalar aplicación», «Instalar y crear acceso
                      directo» o «Añadir a pantalla de inicio», según la
                      versión.
                    </span>
                  </li>
                  <li>
                    <strong>Confirma «Instalar» o «Añadir».</strong>
                    <span>Después abre FutABLE desde su icono.</span>
                  </li>
                </ol>
              ) : (
                <ol>
                  <li>
                    <strong>Abre esta web en Safari.</strong>
                    <span>
                      Desde otra app, copia el enlace y ábrelo en Safari.
                    </span>
                  </li>
                  <li>
                    <strong>
                      Pulsa Compartir <Share size={14} />.
                    </strong>
                    <span>
                      Es el icono del cuadrado con una flecha hacia arriba. En
                      algunas versiones está dentro del menú «Más».
                    </span>
                  </li>
                  <li>
                    <strong>Elige «Añadir a pantalla de inicio».</strong>
                    <span>
                      Desplázate por las acciones si no aparece al principio.
                    </span>
                  </li>
                  <li>
                    <strong>Confirma el nombre y pulsa «Añadir».</strong>
                    <span>
                      Si aparece «Abrir como app web», déjalo activado. Abre
                      FutABLE desde el nuevo icono.
                    </span>
                  </li>
                </ol>
              )}
            </section>
            <div className="install-troubleshooting">
              <h3>¿No aparece la opción?</h3>
              <p>
                Abre el enlace en el navegador indicado y sal del modo privado o
                incógnito. Los nombres del menú pueden variar según el
                dispositivo. Si ya la instalaste, busca su icono en el móvil.
              </p>
            </div>
            <p className="rule-note">
              Instalarla no crea una cuenta. Necesitas conexión para iniciar
              sesión y confirmar partidas.
            </p>
            <a
              className="text-button"
              href={
                platform === "android"
                  ? "https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=es"
                  : "https://support.apple.com/es-es/guide/iphone/iphea86e5236/ios"
              }
              target="_blank"
              rel="noreferrer"
            >
              Guía oficial de{" "}
              {platform === "android" ? "Google Chrome" : "Apple"}
              <ArrowUpRight size={14} />
            </a>
          </Modal>,
          document.body,
        )}
    </>
  );
}
