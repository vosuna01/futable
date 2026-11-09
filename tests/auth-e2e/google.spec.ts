import { test, expect } from "@playwright/test";
const endpoint = "https://auth.liga.test/auth/v1/";
const settings = (enabled: boolean) => ({
  external: { google: enabled, email: true },
});

test("Google usa el SDK y vuelve a la raíz correcta sin pedir contraseña", async ({
  page,
}) => {
  let authorization: URL | undefined;
  await page.route(endpoint + "settings", (route) =>
    route.fulfill({ json: settings(true) }),
  );
  await page.route(endpoint + "authorize**", (route) => {
    authorization = new URL(route.request().url());
    return route.fulfill({
      contentType: "text/html",
      body: "<h1>Proveedor Google de prueba</h1>",
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Entrar con Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proveedor Google de prueba" }),
  ).toBeVisible();
  expect(authorization?.searchParams.get("provider")).toBe("google");
  expect(authorization?.searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:5175/",
  );
  expect(authorization?.searchParams.get("prompt")).toBe("select_account");
  expect(authorization?.searchParams.has("password")).toBe(false);
});

test("un proveedor sin configurar queda oculto y sigue funcionando la contraseña", async ({
  page,
}) => {
  await page.route(endpoint + "settings", (route) =>
    route.fulfill({ json: settings(false) }),
  );
  let credentials: Record<string, unknown> | undefined;
  await page.route(endpoint + "token**", (route) => {
    credentials = route.request().postDataJSON();
    return route.fulfill({
      status: 400,
      json: { code: "invalid_credentials", msg: "Invalid login credentials" },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar con Google" }),
  ).toHaveCount(0);
  await page.getByLabel("Correo electrónico").fill("player@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("ClaveDePrueba123");
  await page.getByRole("button", { name: "Entrar en la liga" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(credentials).toMatchObject({
    email: "player@example.com",
    password: "ClaveDePrueba123",
  });
});

test("un fallo al consultar proveedores no bloquea el acceso existente", async ({
  page,
}) => {
  await page.route(endpoint + "settings", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar en la liga" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Entrar con Google" }),
  ).toHaveCount(0);
});

test("al cancelar Google muestra una salida y no refleja datos del callback", async ({
  page,
}) => {
  await page.route(endpoint + "settings", (route) =>
    route.fulfill({ json: settings(true) }),
  );
  await page.goto(
    "/?error=access_denied&error_description=private-callback-data",
  );
  await expect(page.getByRole("alert")).toContainText(
    "No se ha completado el acceso",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "private-callback-data",
  );
  await expect(
    page.getByRole("button", { name: "Entrar en la liga" }),
  ).toBeEnabled();
});

test("la configuración pública activa Google al volver a la app", async ({
  page,
}) => {
  let enabled = false;
  await page.route(endpoint + "settings", (route) =>
    route.fulfill({ json: settings(enabled) }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar en la liga" }),
  ).toBeVisible();
  enabled = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Entrar con Google" }),
  ).toBeVisible();
});
