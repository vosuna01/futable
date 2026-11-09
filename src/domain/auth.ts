/** Display only known OAuth failures, never tokens or arbitrary callback text. */
export function oauthCallbackError(search: string, hash: string): string {
  const params = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error") || fragment.get("error");
  if (!code) return "";
  if (code === "access_denied")
    return "No se ha completado el acceso con Google. Puedes volver a intentarlo o usar tu contraseña.";
  return "No se ha podido completar el acceso. Vuelve a intentarlo o entra con tu contraseña.";
}
