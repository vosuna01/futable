import { describe, expect, it } from "vitest";
import { oauthCallbackError } from "../src/domain/auth";
describe("Errores del retorno de autenticación", () => {
  it("traduce cancelación sin mostrar contenido del proveedor", () => {
    expect(
      oauthCallbackError("?error=access_denied&error_description=secret", ""),
    ).toContain("No se ha completado");
    expect(
      oauthCallbackError("?error=access_denied&error_description=secret", ""),
    ).not.toContain("secret");
  });
  it("admite el callback en fragmento y no trata tokens como errores", () => {
    expect(
      oauthCallbackError("", "#error=server_error&error_description=secret"),
    ).toContain("No se ha podido");
    expect(oauthCallbackError("", "#access_token=secret")).toBe("");
    expect(oauthCallbackError("", "")).toBe("");
  });
});
