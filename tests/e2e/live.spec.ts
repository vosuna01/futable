import { test, expect, type Page } from "@playwright/test";
const names = [
  "Álvaro Martín",
  "Dani Romero",
  "Pablo Sánchez",
  "Miguel Torres",
  "Javi López",
];
// The picker fills Madrid first and Barça second, in arrival order.
const madrid = ".live-team.red";
const barca = ".live-team.blue";
/** Signs five players up, which is the queue size that forces the tie-break. */
async function signUp(page: Page, count = 5) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await page.locator(".live-entry").click();
  await page
    .locator(".live-empty")
    .getByRole("button", { name: "Fitxo" })
    .click();
  for (const name of names.slice(1, count)) {
    await page.getByRole("button", { name: "Apuntar a alguien" }).click();
    await page.getByRole("dialog").getByRole("button", { name }).click();
  }
  await expect(page.locator(".live-queue")).toContainText(names[count - 1]);
}
async function start(page: Page) {
  await page.getByRole("button", { name: "Empezar partida" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Madrid · Defensa")).toContainText(names[0]);
  await dialog.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
/** The post hand-out opens as a dialog after every rotation. */
async function keepPosts(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Acaban de entrar");
  await expect(dialog).toContainText("Cerrar sesión del día");
  await dialog.getByRole("button", { name: "Así está bien" }).click();
  await expect(dialog).not.toBeVisible();
}

test("ficha, arranca por orden de llegada y rota dejando a uno esperando", async ({
  page,
}) => {
  await signUp(page);
  await expect(page.locator(".live-queue li").first()).toContainText(names[0]);
  await start(page);
  // The fifth stays behind while the first four take the court.
  await expect(page.locator(madrid)).toContainText(names[0]);
  await expect(page.locator(barca)).toContainText(names[2]);
  await expect(page.locator(".live-queue")).toContainText(names[4]);

  await page.getByRole("button", { name: "Gana Barça", exact: true }).click();
  // Winners hold their posts; the one who was waiting comes on.
  await expect(page.locator(barca)).toContainText(names[2]);
  await expect(page.locator(barca)).toContainText(names[3]);
  await expect(page.locator(madrid)).toContainText(names[4]);
  // One loser is back on already and the other waits a round.
  await expect(page.locator(".live-queue li")).toHaveCount(1);
  await keepPosts(page);

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

  await page.locator(".live-entry").click();
  await page.getByRole("button", { name: "Deshacer último resultado" }).click();
  await expect(page.locator(madrid)).toContainText(names[0]);
  await expect(page.locator(madrid)).toContainText(names[1]);
  await expect(page.locator(".live-queue")).toContainText(names[4]);
  await expect(
    page.getByRole("button", { name: "Deshacer último resultado" }),
  ).not.toBeVisible();
});

test("el marcador en vivo manda y se puede anular un gol", async ({ page }) => {
  await signUp(page, 4);
  await start(page);
  // El marcador vive dentro de la tarjeta de cada equipo.
  const board = page.locator(".live-teams");
  await expect(board.getByLabel("Goles Madrid")).toHaveText("0");
  const madridGoal = page.locator(`${madrid} .live-goal`);
  await madridGoal.click();
  await madridGoal.click();
  await expect(board.getByLabel("Goles Madrid")).toHaveText("2");
  await page.getByLabel("Anular gol de Madrid").click();
  await expect(board.getByLabel("Goles Madrid")).toHaveText("1");

  // The board has to agree with whoever you say won.
  await page.getByRole("button", { name: "Gana Barça", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("no coincide");
  await page.getByRole("button", { name: "Gana Madrid", exact: true }).click();
  await keepPosts(page);
  // A new match always starts from zero.
  await expect(board.getByLabel("Goles Madrid")).toHaveText("0");
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Historial" })
    .or(page.locator(".sidebar").getByRole("button", { name: "Historial" }))
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator(".history-grid .panel").first()).toContainText("1");
});

test("la alineación se arma tocando dos puestos", async ({ page }) => {
  await signUp(page, 4);
  await page.getByRole("button", { name: "Empezar partida" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Madrid · Defensa")).toContainText(names[0]);
  // Two posts swap whoever stands in them, whichever side they belong to.
  await dialog.getByLabel("Madrid · Defensa").click();
  await dialog.getByLabel("Barça · Delantero").click();
  await expect(dialog.getByLabel("Barça · Delantero")).toContainText(names[0]);
  await expect(dialog.getByLabel("Madrid · Defensa")).toContainText(names[3]);
  await dialog.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page.locator(barca)).toContainText(names[0]);
  await expect(page.locator(madrid)).toContainText(names[3]);
});

test("el pronóstico pone cuotas a los dos equipos", async ({ page }) => {
  await signUp(page, 4);
  await start(page);
  const bet = page.locator(".live-bet");
  await expect(bet).toContainText("PRONÓSTICO BET365");
  // One decimal quote per team, printed like a bookmaker does.
  await expect(bet.locator(".live-bet-row b")).toHaveCount(2);
  for (const quote of await bet.locator(".live-bet-row b").allInnerTexts())
    expect(Number(quote)).toBeGreaterThanOrEqual(1.01);
});
