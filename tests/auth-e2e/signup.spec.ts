import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
});
async function fill(page: import("@playwright/test").Page) {
  await page.getByLabel("Nombre o apodo").fill("Andrea");
  await page.getByLabel("Correo electrónico").fill("andrea@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("UnaClaveSegura123");
  await page.getByLabel("Confirmar contraseña").fill("UnaClaveSegura123");
}
test("envía el registro real del SDK y pide confirmar correo sin iniciar una sesión ficticia", async ({
  page,
}) => {
  let payload: Record<string, unknown> | undefined;
  await page.route("https://auth.liga.test/auth/v1/signup**", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "30000000-0000-4000-8000-000000000001",
        email: "andrea@example.com",
        identities: [],
        user_metadata: { display_name: "Andrea" },
      }),
    });
  });
  await fill(page);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByRole("status")).toContainText("confirma tu cuenta");
  expect(payload).toMatchObject({
    email: "andrea@example.com",
    password: "UnaClaveSegura123",
    data: { display_name: "Andrea" },
  });
  await expect(
    page.getByRole("button", { name: "Crear mi cuenta" }),
  ).toBeVisible();
});
test("rechaza contraseñas diferentes antes de enviar", async ({ page }) => {
  let requests = 0;
  await page.route("https://auth.liga.test/auth/v1/signup**", () => {
    requests++;
  });
  await fill(page);
  await page.getByLabel("Confirmar contraseña").fill("OtraClaveSegura123");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByRole("alert")).toContainText("no coinciden");
  expect(requests).toBe(0);
});
test("muestra el error de Supabase sin confirmar una cuenta inexistente", async ({
  page,
}) => {
  await page.route("https://auth.liga.test/auth/v1/signup**", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "signup_disabled",
        msg: "Signups not allowed for this instance",
      }),
    }),
  );
  await fill(page);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar en la liga" }),
  ).toBeVisible();
});
