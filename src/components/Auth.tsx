import { appUrl } from "../domain/app-url";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthProviders } from "../data/useAuthProviders";
import { oauthCallbackError } from "../domain/auth";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import {
  supabase,
  passwordFlow,
  emailConfirmationRequired,
  emailDeliveryEnabled,
} from "../data/supabase";
import { Logo } from "./ui";
import { FoosballVisual } from "./FoosballVisual";
import { InstallHelp } from "./InstallHelp";
export function Auth({ onDemo }: { onDemo: () => void }) {
  const providers = useAuthProviders();
  const googleAttempt = useRef(false);
  const [mode, setMode] = useState<
      "login" | "signup" | "link" | "reset" | "password"
    >(passwordFlow ? "password" : "login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() =>
      oauthCallbackError(location.search, location.hash),
    ),
    [message, setMessage] = useState("");
  async function enterWithGoogle() {
    if (googleAttempt.current || busy || !supabase || !providers.google) return;
    if (!navigator.onLine) {
      setError("Necesitas conexión para entrar con Google.");
      return;
    }
    googleAttempt.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL(appUrl(), location.origin).href,
          queryParams: { prompt: "select_account" },
        },
      });
      if (result.error) throw result.error;
    } catch {
      setError(
        "No se ha podido abrir Google. Vuelve a intentarlo o entra con tu contraseña.",
      );
      googleAttempt.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("password");
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setError(
        "El registro estará disponible al conectar Supabase. No se ha creado ninguna cuenta.",
      );
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email") || ""),
      password = String(f.get("password") || "");
    if (
      mode === "signup" &&
      password !== String(f.get("confirm_password") || "")
    ) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }
    try {
      const redirect = new URL(appUrl(), location.origin).href;
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: redirect,
                data: {
                  display_name: String(f.get("display_name") || "").trim(),
                },
              },
            })
          : mode === "login"
            ? await supabase.auth.signInWithPassword({ email, password })
            : mode === "password"
              ? await supabase.auth.updateUser({ password })
              : mode === "reset"
                ? await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: redirect,
                  })
                : await supabase.auth.signInWithOtp({
                    email,
                    options: {
                      shouldCreateUser: false,
                      emailRedirectTo: redirect,
                    },
                  });
      if (result.error) throw result.error;
      setMessage(
        mode === "signup"
          ? emailConfirmationRequired
            ? "Revisa tu correo y confirma tu cuenta para entrar en la liga. Si ya tienes una cuenta, utiliza Entrar o Recuperar acceso."
            : "Cuenta creada. Entrando en tu liga…"
          : mode === "password"
            ? "Contraseña actualizada."
            : mode === "login"
              ? "Sesión iniciada."
              : "Si tu cuenta está autorizada, recibirás un correo.",
      );
      if (mode === "password") location.assign(appUrl());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <a className="brand" href={appUrl()}>
          <Logo />
          <span>
            LIGA<strong>FutABLE</strong>
            <small>ABLE HUMAN MOTION</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">LA LIGA DE LA OFICINA</span>
          <h1>
            El mejor momento
            <br />
            del día se juega
            <br />
            <em>en equipo.</em>
          </h1>
          <p>
            Parejas que cambian. Rivalidades que crecen.
            <br />
            Cada partida tiene su lugar.
          </p>
          <FoosballVisual variant="auth" />
        </div>
        <span className="story-footer">BUEN JUEGO. MEJOR COMPAÑÍA.</span>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <span className="chip gold-chip">
            <LockKeyhole size={13} /> LIGA PRIVADA
          </span>
          <h2>
            {mode === "password"
              ? "Tu nueva contraseña"
              : mode === "signup"
                ? "Tu sitio en la liga."
                : "Aquí empieza tu partida."}
          </h2>
          <p className="muted">
            {mode === "password"
              ? "Elige una contraseña para tu cuenta."
              : mode === "signup"
                ? "Crea tu cuenta y únete a la competición como jugador."
                : "Entra en tu cuenta o crea una para unirte a la liga."}
          </p>
          {providers.google && (mode === "login" || mode === "signup") && (
            <div className="google-access">
              <button
                type="button"
                className="google-login full"
                disabled={busy}
                onClick={() => void enterWithGoogle()}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.89.6-2.03.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.4 13.91a6 6 0 0 1 0-3.82V7.5H3.06a10 10 0 0 0 0 9l3.34-2.59Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
                  />
                </svg>
                {busy ? "Conectando…" : "Entrar con Google"}
              </button>
              <p className="rule-note">
                Sin otra contraseña. Si ya juegas, elige el mismo correo de tu
                cuenta para conservar tu perfil y tus partidas.
              </p>
              <div className="divider">
                <span>O ENTRA CON TU CORREO Y CONTRASEÑA</span>
              </div>
            </div>
          )}
          {mode !== "password" && (
            <div
              className="auth-switch"
              role="group"
              aria-label="Acceso a la liga"
            >
              {(
                [
                  ["login", "Entrar"],
                  ["signup", "Crear cuenta"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    setError("");
                    setMessage("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!supabase && (
            <div className="setup-notice">
              <ShieldCheck size={21} />
              <div>
                <strong>La pista está preparada.</strong>
                <p>
                  Falta conectar Supabase para activar las cuentas y la
                  sincronización online. Encontrarás los pasos en el README del
                  proyecto.
                </p>
              </div>
            </div>
          )}
          {(supabase || mode === "signup") && (
            <form onSubmit={(e) => void submit(e)}>
              {mode === "signup" && (
                <label className="field">
                  Nombre o apodo
                  <input
                    name="display_name"
                    autoComplete="nickname"
                    minLength={1}
                    maxLength={60}
                    required
                    placeholder="Cómo te conocen en la oficina"
                  />
                </label>
              )}
              {mode !== "password" && (
                <label className="field">
                  Correo electrónico
                  <div className="input-icon">
                    <Mail size={17} />
                    <input
                      autoComplete="email"
                      name="email"
                      type="email"
                      required
                      placeholder="tu@empresa.com"
                    />
                  </div>
                </label>
              )}
              {(mode === "login" ||
                mode === "password" ||
                mode === "signup") && (
                <label className="field">
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete={
                      mode === "password" || mode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    required
                    placeholder="Tu contraseña"
                  />
                </label>
              )}
              {mode === "signup" && (
                <label className="field">
                  Confirmar contraseña
                  <input
                    name="confirm_password"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                    placeholder="Repite tu contraseña"
                  />
                </label>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="confirmation" role="status">
                  {message}
                </p>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? "Conectando…"
                  : mode === "password"
                    ? "Guardar contraseña"
                    : mode === "signup"
                      ? "Crear mi cuenta"
                      : mode === "login"
                        ? "Entrar en la liga"
                        : "Enviar enlace"}
                <ArrowRight size={18} />
              </button>
              {mode === "signup" && (
                <p className="rule-note">
                  {emailConfirmationRequired
                    ? "Confirma tu correo para activar el acceso."
                    : "Al crear tu cuenta entrarás directamente en la liga."}{" "}
                  Tu cuenta tendrá permisos de jugador.
                </p>
              )}
              {emailDeliveryEnabled &&
                mode !== "password" &&
                mode !== "signup" && (
                  <div className="auth-links">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMode(mode === "link" ? "login" : "link");
                        setError("");
                        setMessage("");
                      }}
                    >
                      {mode === "link"
                        ? "Usar contraseña"
                        : "Entrar con enlace por correo"}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMode("reset");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Recuperar acceso
                    </button>
                  </div>
                )}
              {!emailDeliveryEnabled && mode === "login" && (
                <p className="rule-note">
                  Si necesitas recuperar el acceso, avisa al administrador de la
                  liga.
                </p>
              )}
            </form>
          )}
          <div className="divider">
            <span>CONOCE LA EXPERIENCIA</span>
          </div>
          <button className="secondary full" onClick={onDemo}>
            Explorar demostración
            <ArrowRight size={17} />
          </button>
          <p className="rule-note">
            Datos ficticios · Sin conexión a una liga real
          </p>
          <InstallHelp />
          <p className="rule-note">
            <a href={appUrl("informacion.html")}>Acerca de FutABLE</a> ·{" "}
            <a href={appUrl("privacidad.html")}>Privacidad</a> ·{" "}
            <a href={appUrl("uso.html")}>Condiciones de uso</a>
          </p>
          <footer>
            <ShieldCheck size={15} /> Registro personal · Sesión segura · Acceso
            con sesión
          </footer>
        </div>
      </main>
    </div>
  );
}
