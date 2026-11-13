import { test, expect, type Page } from "@playwright/test";
const names = ["Dani Romero", "Pablo Sánchez", "Miguel Torres", "Javi López"];
async function club(page: Page) {
  await page
    .getByRole("button", { name: "Club", exact: true })
    .filter({ visible: true })
    .first()
    .click();
}
test("coins: apuesta como espectador, reparto, deshacer y palmarés sin historial ficticio", async ({
  page,
}) => {
  await page.goto("/?tablet");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  for (const name of names) {
    await page.getByRole("button", { name: "Apuntar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name }).click();
  }
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByLabel("Salir del modo tablet").click();
  await club(page);
  await page.getByRole("button", { name: "Recibir 100 coins" }).click();
  await expect(page.locator(".coin-wallet strong")).toHaveText("100");
  const priceText = await page
    .locator(".coin-sides button")
    .filter({ hasText: "Madrid" })
    .locator("strong")
    .innerText();
  const price = Number(priceText.replace("Cuota ", ""));
  const payout = Math.floor((10 * Math.round(price * 100)) / 100);
  await page.getByLabel("Coins a apostar").fill("10");
  await page.getByRole("button", { name: "Apostar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar 10 coins" })
    .click();
  await expect(page.locator(".coin-wallet strong")).toHaveText("90");
  await expect(page.locator(".coin-ticket")).toContainText("10 coins a Madrid");
  await expect(page.locator(".coin-ticket")).toContainText(
    `cuota ${price.toFixed(2)}`,
  );
  await expect(page.locator(".coin-ticket")).toContainText(`${payout} coins`);
  await page.locator(".live-entry").click();
  await page.getByRole("button", { name: "Gana Madrid", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Así está bien" })
    .click();
  await club(page);
  await expect(page.locator(".coin-wallet strong")).toHaveText(
    String(90 + payout),
  );
  await expect(page.locator(".coin-standings")).toContainText("105");
  await expect(page.locator(".coin-ledger").first()).toContainText(
    "Premio de apuesta",
  );
  await page.locator(".live-entry").click();
  await page.getByRole("button", { name: "Deshacer último resultado" }).click();
  await club(page);
  await expect(page.locator(".coin-wallet strong")).toHaveText("100");
  await expect(page.locator(".coin-standings")).not.toContainText("105");
  await page.getByRole("button", { name: "Palmarés", exact: true }).click();
  await expect(
    page.getByText("Premios en juego", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("TEMPORADA CERRADA", { exact: true }),
  ).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
