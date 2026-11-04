import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
});

test("edita el nombre y la foto del perfil sin perder partidas y puede quitarla", async ({
  page,
}) => {
  const before = await page.locator(".stats-strip>div").first().innerText();
  const open = () =>
    page
      .locator(".topbar")
      .getByRole("button", { name: "Mi perfil", exact: true })
      .filter({ visible: true })
      .first()
      .click();
  await open();
  const dialog = page.getByRole("dialog", { name: "Mi perfil" });
  await dialog.getByLabel("Nombre o apodo").fill("Capitana FutABLE");
  await dialog.getByLabel("Foto de perfil").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0j8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(dialog.locator(".profile-photo-preview img")).toHaveAttribute(
    "src",
    /^data:image\/jpeg;base64,/,
  );
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("Perfil actualizado");
  expect(await page.locator(".stats-strip>div").first().innerText()).toBe(
    before,
  );
  await open();
  await expect(dialog.getByLabel("Nombre o apodo")).toHaveValue(
    "Capitana FutABLE",
  );
  await expect(dialog.locator(".profile-photo-preview img")).toBeVisible();
  await dialog.getByRole("button", { name: "Quitar foto" }).click();
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).not.toBeVisible();
  await open();
  await expect(dialog.locator(".profile-photo-preview img")).toHaveCount(0);
});

test("el perfil rechaza archivos no compatibles y no guarda sin conexión", async ({
  page,
  context,
}) => {
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Mi perfil", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Mi perfil" });
  await dialog.getByLabel("Foto de perfil").setInputFiles({
    name: "texto.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("No es una foto"),
  });
  await expect(dialog.getByRole("alert")).toContainText("JPG, PNG o WebP");
  await context.setOffline(true);
  await expect(
    dialog.getByRole("button", { name: "Guardar cambios" }),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("registra desde móvil, confirma y reconstruye los rankings", async ({
  page,
  isMobile,
}) => {
  const before = await page.locator(".stats-strip>div").first().innerText();
  await page
    .getByRole("button", { name: "Nueva partida", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Repetir últimos equipos" }).click();
  await dialog.getByRole("button", { name: "A 2 goles", exact: true }).click();
  await expect(dialog.getByLabel("Goles Barça")).toHaveValue("2");
  await dialog.getByLabel("Goles Madrid").fill("1");
  await dialog.getByRole("button", { name: "Revisar resultado" }).click();
  await expect(dialog.getByText(/^Gana /)).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar y guardar" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText("demostración");
  expect(await page.locator(".stats-strip>div").first().innerText()).not.toBe(
    before,
  );
  await page
    .locator(isMobile ? ".bottom-nav" : ".sidebar")
    .getByRole("button", { name: "Historial", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "El historial." }),
  ).toBeVisible();
  await expect(
    page.locator(".history-grid .match-result").first(),
  ).toContainText("2");
});

test("permite tres goles y un marcador personalizado, y bloquea empates", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Nueva partida", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Repetir últimos equipos" }).click();
  await dialog.getByRole("button", { name: "A 3 goles", exact: true }).click();
  await expect(dialog.getByLabel("Goles Barça")).toHaveValue("3");
  await dialog.getByLabel("Goles Madrid").fill("3");
  await dialog.getByRole("button", { name: "Revisar resultado" }).click();
  await expect(dialog.getByRole("alert")).toContainText("sin empate");
  await dialog.getByLabel("Goles Madrid").fill("7");
  await dialog.getByRole("button", { name: "Revisar resultado" }).click();
  await expect(dialog.getByText(/^Gana /)).toContainText("7–3");
  await dialog.getByRole("button", { name: "Confirmar y guardar" }).click();
  await expect(dialog).not.toBeVisible();
});
test("separa provisionales, muestra perfiles y no ofrece display", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Ver todos", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "General", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Defensas", exact: true }).click();
  await expect(page.locator(".provisional-label")).toBeVisible();
  await page.getByRole("tab", { name: "Completos", exact: true }).click();
  await expect(page.getByText("Rendimiento por posición")).toBeVisible();
  await page.goto("/display");
  await expect(
    page.getByRole("heading", { name: "Esta página no existe." }),
  ).toBeVisible();
});
test("sin conexión no confirma una partida ni desborda el viewport", async ({
  page,
  context,
}) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await context.setOffline(true);
  await expect(page.getByText("Sin conexión. Se muestran")).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Nueva partida", exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeDisabled();
  await context.setOffline(false);
});
test("muestra la ayuda de instalación antes y después de entrar, con la marca FutABLE", async ({
  page,
}) => {
  await expect(page).toHaveTitle("Liga FutABLE · La liga de la oficina");
  await page
    .getByRole("button", { name: "Ayuda: instalar app", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Instalar FutABLE" });
  await dialog.getByRole("tab", { name: "Android", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "En Chrome para Android" }),
  ).toBeVisible();
  await expect(dialog.getByRole("tabpanel")).toContainText("tres puntos");
  await dialog.getByRole("tab", { name: "iPhone / iPad", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "En Safari para iPhone o iPad" }),
  ).toBeVisible();
  await expect(dialog.getByRole("tabpanel")).toContainText(
    "Añadir a pantalla de inicio",
  );
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ayuda: instalar app", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Instalar FutABLE" }),
  ).toBeVisible();
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.name).toBe("Liga FutABLE");
  expect(manifest.short_name).toBe("FutABLE");
});

for (const winner of ["Barça", "Madrid"] as const) {
  test(
    "rey de la pista mantiene a " + winner + " y deja elegir nuevos rivales",
    async ({ page }) => {
      const open = () =>
        page
          .getByRole("button", { name: "Nueva partida", exact: true })
          .filter({ visible: true })
          .first()
          .click();
      await open();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "Repetir últimos equipos" })
        .click();
      const names = await Promise.all(
        ["defensa", "delantero"].map((position) =>
          dialog
            .getByRole("button", { name: winner + " " + position, exact: true })
            .innerText(),
        ),
      );
      await dialog
        .getByLabel("Goles Barça")
        .fill(winner === "Barça" ? "3" : "1");
      await dialog
        .getByLabel("Goles Madrid")
        .fill(winner === "Madrid" ? "3" : "1");
      await dialog.getByRole("button", { name: "Revisar resultado" }).click();
      await expect(dialog.getByText(/^Gana /)).toContainText(winner);
      await dialog.getByRole("button", { name: "Confirmar y guardar" }).click();
      await expect(dialog).not.toBeVisible();
      await open();
      await expect(dialog.locator(".king-banner")).toContainText(
        winner + " continúa",
      );
      const rival = winner === "Barça" ? "Madrid" : "Barça";
      for (const [i, position] of ["defensa", "delantero"].entries()) {
        await expect(
          dialog.getByRole("button", {
            name: winner + " " + position,
            exact: true,
          }),
        ).toHaveText(names[i], { useInnerText: true });
        await expect(
          dialog.getByRole("button", {
            name: rival + " " + position,
            exact: true,
          }),
        ).toContainText("Elegir jugador");
      }
      await expect(
        dialog.getByRole("button", { name: rival + " defensa", exact: true }),
      ).toHaveClass(/selected/);
      await dialog
        .locator(".player-options button:not(:disabled)")
        .first()
        .click();
      await expect(
        dialog.getByRole("button", { name: rival + " delantero", exact: true }),
      ).toHaveClass(/selected/);
      await dialog
        .locator(".player-options button:not(:disabled)")
        .first()
        .click();
      for (const [i, position] of ["defensa", "delantero"].entries())
        await expect(
          dialog.getByRole("button", {
            name: winner + " " + position,
            exact: true,
          }),
        ).toHaveText(names[i], { useInnerText: true });
      await dialog
        .getByRole("button", { name: "Empezar de cero", exact: true })
        .click();
      await expect(dialog.locator(".king-banner")).toHaveCount(0);
      await expect(
        dialog.locator(".player-slot").filter({ hasText: "Elegir jugador" }),
      ).toHaveCount(4);
    },
  );
}
