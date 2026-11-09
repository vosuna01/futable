import { test, expect, type Page } from "@playwright/test";
const names = [
  "Álvaro Martín",
  "Dani Romero",
  "Pablo Sánchez",
  "Miguel Torres",
  "Javi López",
];
const madrid = ".tablet-team.red";
const barca = ".tablet-team.blue";

/** Opens the demo straight on `/?tablet` and signs five players up from the wall. */
async function openTablet(page: Page) {
  await page.goto("/?tablet");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await expect(page.getByText("No hay partida en directo.")).toBeVisible();
  for (const name of names) {
    await page.getByRole("button", { name: "Apuntar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
}

test("la tablet lleva una partida entera: goleadores, puestos, cola y resultado", async ({
  page,
}) => {
  await openTablet(page);
  const queue = page.locator(".tablet-queue");
  await expect(queue).toContainText("5 esperando");

  // The second waiting pair agrees to swap before anyone steps in.
  await page.getByLabel("Cambiar puestos de la pareja 2").click();
  await page.getByRole("button", { name: "Empezar partida" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Barça · Defensa")).toContainText(names[3]);
  await expect(dialog.getByLabel("Barça · Delantero")).toContainText(names[2]);
  await dialog.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.locator(madrid)).toContainText(names[0]);

  // Goals per player, then one taken back from that player.
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("2");
  await expect(page.locator(madrid)).toContainText("⚽ 2");
  await page.getByLabel(`Quitar gol de ${names[0]}`).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("1");
  // A goal for the team without naming anyone.
  await page.getByRole("button", { name: "Gol Madrid" }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("2");

  // Swap defender and forward with one tap.
  const madridPosts = page.locator(`${madrid} .tablet-scorer`);
  await expect(madridPosts.first()).toContainText(names[0]);
  await page
    .locator(madrid)
    .getByRole("button", { name: "Intercambiar defensa y delantero" })
    .click();
  await expect(madridPosts.first()).toContainText(names[1]);
  // The scorer keeps their goal after moving.
  await expect(madridPosts.nth(1)).toContainText("⚽ 1");

  // The one waiting alone is told to attack: the loser who returns defends.
  await expect(queue).toContainText(names[4]);
  await page.getByLabel("Cambiar puestos de la pareja 1").click();

  await page.getByRole("button", { name: "Gana Madrid" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar resultado" })
    .click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("0");
  const barcaPosts = page.locator(`${barca} .tablet-scorer`);
  await expect(barcaPosts.nth(1)).toContainText(names[4]);
  await expect(barcaPosts.first()).not.toContainText(names[4]);

  // Undo brings back the board and the queue.
  await page.getByRole("button", { name: "Deshacer último resultado" }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("2");
  await expect(queue).toContainText(names[4]);
});

test("se abre y se cierra desde la partida en directo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await page.locator(".live-entry").click();
  await page
    .getByRole("button", { name: "Abrir modo tablet de pared" })
    .click();
  await expect(page).toHaveURL(/\?tablet$/);
  await expect(page.locator(".tablet")).toBeVisible();
  await page.getByLabel("Salir del modo tablet").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".live-match")).toBeVisible();
});
