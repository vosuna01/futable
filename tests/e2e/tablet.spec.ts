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

test("sustituye jugadores, conserva al rival y vuelve a guardar resultados", async ({
  page,
}) => {
  await openTablet(page);
  await page.getByRole("button", { name: /Partidas a .* goles/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "5", exact: true })
    .click();
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  await page.getByLabel("Cambiar jugadores de Madrid").click();
  const dialog = page.getByRole("dialog");
  const defender = dialog.getByRole("combobox", {
    name: "Defensa",
    exact: true,
  });
  const incoming = { label: `${names[4]} · En la cola` };
  await defender.selectOption(incoming);
  // The other team cannot be selected and a player cannot occupy both posts.
  await expect(defender).not.toContainText(names[2]);
  await expect(defender).not.toContainText(names[3]);
  await expect(dialog.getByText(/El marcador vuelve a 0–0/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("1");
  await page.getByLabel("Cambiar jugadores de Madrid").click();
  await dialog
    .getByRole("combobox", { name: "Defensa", exact: true })
    .selectOption(incoming);
  await dialog.getByRole("button", { name: "Guardar pareja" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(`${madrid} .tablet-scorer`).first()).toContainText(
    names[4],
  );
  await expect(page.locator(`${madrid} .tablet-scorer`).nth(1)).toContainText(
    names[1],
  );
  await expect(page.locator(barca)).toContainText(names[2]);
  await expect(page.locator(barca)).toContainText(names[3]);
  await expect(page.getByLabel("Goles Madrid")).toHaveText("0");
  await expect(page.locator(".tablet-queue")).toContainText(names[0]);
  await expect(page.locator(".tablet-queue")).not.toContainText(names[4]);
  await expect(
    page.getByRole("button", { name: /Partidas a 5 goles/ }),
  ).toBeVisible();
  await page.getByLabel(`Gol de ${names[4]}`, { exact: true }).click();
  await page.getByRole("button", { name: "Gana Madrid", exact: true }).click();
  await dialog.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("0");
  await expect(page.locator(madrid)).toContainText(names[4]);
  await expect(
    page.getByRole("button", { name: /Partidas a 5 goles/ }),
  ).toBeVisible();
});

test("los nombres al fichar tienen contraste y la tablet cabe en pantallas pequeñas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 853, height: 533 });
  await openTablet(page);
  await page.getByRole("button", { name: "Apuntar", exact: true }).click();
  const button = page
    .getByRole("dialog")
    .locator(".live-picker button")
    .first();
  const ratio = await button.evaluate((el) => {
    const linear = (c: number) => {
      const n = c / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color: string) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map(linear);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const style = getComputedStyle(el),
      fg = luminance(style.color),
      bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  for (const size of [
    { width: 853, height: 533 },
    { width: 1024, height: 600 },
    { width: 600, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      page.getByLabel("Cambiar jugadores de Madrid"),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Gana Barça", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

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

test("elige a cuántos goles se juega y avisa cuando un equipo llega", async ({
  page,
}) => {
  await openTablet(page);
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByRole("button", { name: /Partidas a \d+ goles/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "2", exact: true })
    .click();
  const target = page.getByRole("button", { name: /Partidas a 2 goles/ });
  await expect(target).toContainText("A 2 goles");
  const madridWin = page.getByRole("button", { name: "Gana Madrid" });
  await expect(madridWin).not.toHaveClass(/ready/);
  await page.getByRole("button", { name: "Gol Madrid" }).click();
  await page.getByRole("button", { name: "Gol Madrid" }).click();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("2");
  await expect(madridWin).toHaveClass(/ready/);
  // Reaching the target opens the end screen; the choice lasts for the next matches.
  const end = page.getByRole("dialog", { name: "Fin de partida" });
  await expect(end).toContainText("Gana Madrid");
  await end.getByRole("button", { name: "Confirmar" }).click();
  await expect(end).not.toBeVisible();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("0");
  await expect(target).toContainText("A 2 goles");
});

test("celebra cada gol con la cara de quien marca y al final pide confirmar o volver atrás", async ({
  page,
}) => {
  await openTablet(page);
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByRole("button", { name: /Partidas a \d+ goles/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "2", exact: true })
    .click();
  // A goal credited to a player shows that player in the celebration.
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  const cheer = page.locator(".tablet-cheer");
  await expect(cheer).toContainText("¡GOOOL!");
  await expect(cheer).toContainText(names[0]);
  await expect(cheer).not.toBeVisible({ timeout: 5000 });
  // The winning goal opens the end screen with the winners and the score.
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  const end = page.getByRole("dialog", { name: "Fin de partida" });
  await expect(end).toContainText("Gana Madrid");
  await expect(end).toContainText(names[0]);
  await expect(end.getByLabel("Resultado")).toContainText("2");
  // A double press: going back removes that last goal and keeps playing.
  await end.getByRole("button", { name: "Volver atrás" }).click();
  await expect(end).not.toBeVisible();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("1");
  await page.getByRole("button", { name: "Gol Madrid" }).click();
  await end.getByRole("button", { name: "Confirmar" }).click();
  await expect(end).not.toBeVisible();
  await expect(page.getByLabel("Goles Madrid")).toHaveText("0");
});

test("suena al marcar un gol y otra vez al terminar la partida, y se puede silenciar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { sounds: string[] };
    w.sounds = [];
    window.addEventListener("futable-sound", (e) =>
      w.sounds.push((e as CustomEvent<string>).detail),
    );
  });
  const sounds = () =>
    page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);
  await openTablet(page);
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByRole("button", { name: /Partidas a \d+ goles/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "2", exact: true })
    .click();
  // A normal goal plays the goal sound.
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  await expect.poll(sounds).toEqual(["goal"]);
  // Muting is remembered on the tablet (the sound is still asked for, but silent).
  await page.getByRole("button", { name: "Silenciar sonidos" }).click();
  await expect(page.getByRole("button", { name: "Activar sonidos" })).toBeVisible();
  // The winning goal plays the end-of-match sound instead of the goal one.
  await page.getByLabel(`Gol de ${names[0]}`, { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Fin de partida" })).toBeVisible();
  await expect.poll(sounds).toEqual(["goal", "final"]);
  await page.reload();
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await expect(page.getByRole("button", { name: "Activar sonidos" })).toBeVisible();
});
