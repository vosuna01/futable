import { test, expect } from "@playwright/test";

test("tras actualizar enseña las novedades una sola vez", async ({ page }) => {
  // Simula volver de pulsar «Actualizar aplicación».
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("e2e-primed")) {
      localStorage.setItem("futable:updated", "1");
      sessionStorage.setItem("e2e-primed", "1");
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  const dialog = page.getByRole("dialog", { name: "Novedades de FutABLE" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Mi sesión actual")).toBeVisible();
  await dialog.getByRole("button", { name: "¡Entendido!" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await expect(page.locator(".app-shell, main").first()).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Novedades de FutABLE" }),
  ).toHaveCount(0);
});

test("una visita normal no enseña novedades", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await expect(
    page.getByRole("dialog", { name: "Novedades de FutABLE" }),
  ).toHaveCount(0);
});
