import { test, expect, type Page } from "@playwright/test";
const names = [
  "Álvaro Martín",
  "Dani Romero",
  "Pablo Sánchez",
  "Miguel Torres",
  "Javi López",
  "Carlos Ruiz",
  "Sergio Díaz",
  "Marcos Vega",
];
async function setup(page: Page, queue = true) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await page.locator(".king-entry").click();
  await page
    .getByRole("button", { name: "Preparar sesión", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const [i, label] of [
    "Barça defensa",
    "Barça delantero",
    "Madrid defensa",
    "Madrid delantero",
  ].entries())
    await dialog
      .getByLabel(label, { exact: true })
      .selectOption({ label: names[i] });
  if (queue) {
    await dialog
      .getByRole("button", { name: "Añadir pareja a la cola" })
      .click();
    await dialog
      .getByLabel("Pareja 1 defensa", { exact: true })
      .selectOption({ label: names[4] });
    await dialog
      .getByLabel("Pareja 1 delantero", { exact: true })
      .selectOption({ label: names[5] });
  }
  await dialog
    .getByRole("button", { name: "Empezar sesión", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
test("una victoria rota, cuenta en historial sin goles y deshacer restaura la pista", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Gana Barça", exact: true }).click();
  await expect(page.locator(".king-team.blue")).toContainText(names[0]);
  await expect(page.locator(".king-team.red")).toContainText(names[4]);
  await expect(page.locator(".king-queue")).toContainText(names[2]);
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Historial" })
    .or(page.locator(".sidebar").getByRole("button", { name: "Historial" }))
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator(".history-grid .panel").first()).toContainText(
    "Victoria registrada sin marcador",
  );
  await page.locator(".king-entry").click();
  await page.getByRole("button", { name: "Deshacer último resultado" }).click();
  await expect(page.locator(".king-team.red")).toContainText(names[2]);
  await expect(page.locator(".king-queue")).toContainText(names[4]);
  await expect(
    page.getByRole("button", { name: "Deshacer último resultado" }),
  ).not.toBeVisible();
});
test("sin cola se pausa y no hay revancha automática", async ({ page }) => {
  await setup(page, false);
  await page.getByRole("button", { name: "Gana Madrid", exact: true }).click();
  await expect(
    page.getByText("Esperando una nueva pareja", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".king-team.blue")).toContainText("Puesto libre");
  await expect(
    page.getByRole("button", { name: "Gana Madrid", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Parejas y cola", exact: true })
    .click();
  await page.getByRole("button", { name: "Añadir pareja a Barça" }).click();
  await page
    .getByLabel("Barça defensa", { exact: true })
    .selectOption({ label: names[4] });
  await page
    .getByLabel("Barça delantero", { exact: true })
    .selectOption({ label: names[5] });
  await page.getByRole("button", { name: "Guardar parejas y cola" }).click();
  await expect(
    page.getByRole("button", { name: "Gana Madrid", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".king-team.blue")).toContainText(names[4]);
});
test("marcador opcional, puestos y cola editables, sin guardar offline", async ({
  page,
  context,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Parejas y cola", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Intercambiar posiciones Barça", exact: true })
    .click();
  await page.getByRole("button", { name: "Añadir pareja a la cola" }).click();
  await page
    .getByLabel("Pareja 2 defensa", { exact: true })
    .selectOption({ label: names[6] });
  await page
    .getByLabel("Pareja 2 delantero", { exact: true })
    .selectOption({ label: names[7] });
  await page
    .getByRole("button", { name: "Subir pareja 2", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar parejas y cola" }).click();
  await expect(
    page.locator(".king-team.blue .king-pair>div").first(),
  ).toContainText(names[1]);
  await page.getByLabel("Añadir marcador exacto (opcional)").check();
  await page.getByLabel("Marcador Barça", { exact: true }).fill("1");
  await page.getByLabel("Marcador Madrid", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Gana Barça", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("coincidir");
  await page.getByRole("button", { name: "Gana Madrid", exact: true }).click();
  await expect(page.locator(".king-team.blue")).toContainText(names[6]);
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Gana Madrid", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Terminar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Terminar y conservar resultados" })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparar sesión", exact: true }),
  ).toBeVisible();
});
