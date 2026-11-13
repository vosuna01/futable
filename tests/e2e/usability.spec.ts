import { test, expect, type Page } from "@playwright/test";
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
}
async function nav(page: Page, name: RegExp) {
  await page
    .locator(".sidebar,.bottom-nav")
    .getByRole("button", { name })
    .filter({ visible: true })
    .first()
    .click();
}
test("el historial carga por bloques y permite recuperar una búsqueda vacía", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-11T12:00:00Z"));
  await demo(page);
  await nav(page, /^Historial$/);
  await expect(page.locator(".history-grid>article")).toHaveCount(12);
  await page.getByRole("button", { name: "Ver 12 partidas más" }).click();
  await expect(page.locator(".history-grid>article")).toHaveCount(24);
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No hay partidas con estos filtros" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await expect(page.locator(".history-grid>article")).toHaveCount(12);
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  await expect(page.locator(".history-grid>article")).toHaveCount(0);
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.locator(".history-grid>article")).toHaveCount(12);
  await page
    .getByLabel("Filtrar por jugador")
    .selectOption({ label: "Dani Romero" });
  for (const card of await page.locator(".history-grid>article").all())
    await expect(card).toContainText("Dani Romero");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("búsqueda sin tildes, resultados vacíos y navegación de rankings por teclado", async ({
  page,
}) => {
  await demo(page);
  await nav(page, /^(Rankings|Clasificaciones)$/);
  await page.getByLabel("Buscar en ranking").fill("ALVARO");
  await expect(page.locator(".ranking-table .player-name")).toHaveCount(1);
  await expect(page.locator(".ranking-table")).toContainText("Álvaro Martín");
  await page.getByLabel("Buscar en ranking").fill("NoExisteNadie");
  await page.getByRole("button", { name: "Borrar búsqueda" }).click();
  await page.getByRole("tab", { name: "General", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Defensas", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await nav(page, /^Jugadores$/);
  await page.getByLabel("Buscar en plantilla").fill("adrian");
  await expect(page.locator(".players-grid>button")).toHaveCount(1);
  await page.locator(".players-grid>button").click();
  await expect(
    page.getByRole("heading", { name: "Adrián Moreno", exact: true }),
  ).toBeVisible();
});
test("los diálogos bloquean el fondo y devuelven el foco al cerrarse", async ({
  page,
}) => {
  await demo(page);
  const trigger = page
    .locator(".topbar")
    .getByRole("button", { name: "Mi perfil", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Mi perfil" })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
test("busca al fichar y cambia los goles desde el directo móvil", async ({
  page,
  isMobile,
}) => {
  await demo(page);
  if (isMobile)
    await page
      .getByRole("button", { name: "Ir a la partida en directo" })
      .click();
  else await page.locator(".live-entry").click();
  await page
    .locator(".live-empty")
    .getByRole("button", { name: "Fitxo" })
    .click();
  for (const [query, name] of [
    ["adrian", "Adrián Moreno"],
    ["dani", "Dani Romero"],
    ["pablo", "Pablo Sánchez"],
  ]) {
    await page.getByRole("button", { name: "Apuntar a alguien" }).click();
    await page.getByLabel("Buscar para fichar").fill(query);
    await page.getByRole("dialog").getByRole("button", { name }).click();
  }
  await page.getByLabel("Cambiar objetivo de goles").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "6 goles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar objetivo", exact: true })
    .click();
  await expect(page.locator(".live-session-tools")).toContainText("6 goles");
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await expect(page.locator(".live-teams")).toBeVisible();
});
test("administrar una cuenta precarga su identidad y sus permisos", async ({
  page,
  isMobile,
}) => {
  await demo(page);
  if (isMobile) await page.getByLabel("Abrir menú").click();
  await page
    .getByRole("button", { name: "Administración", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel("Gestionar acceso de Administrador demo").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Cuenta registrada")).toHaveValue(
    "00000000-0000-4000-8000-000000000003",
  );
  await expect(dialog.getByLabel("Nombre visible")).toHaveValue(
    "Administrador demo",
  );
  await expect(dialog.getByLabel("Permisos")).toHaveValue("admin");
  await expect(dialog.getByLabel("UUID de usuario")).toHaveAttribute(
    "readonly",
    "",
  );
});
test("al apostar al Barça el equipo resaltado coincide con el boleto", async ({
  page,
}) => {
  await page.goto("/?tablet");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  for (const name of [
    "Dani Romero",
    "Pablo Sánchez",
    "Miguel Torres",
    "Javi López",
  ]) {
    await page.getByRole("button", { name: "Apuntar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name }).click();
  }
  await page.getByRole("button", { name: "Empezar partida" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Empezar", exact: true })
    .click();
  await page.getByLabel("Salir del modo tablet").click();
  await nav(page, /^Club$/);
  const barca = page.locator(".coin-sides button").filter({ hasText: "Barça" }),
    madrid = page.locator(".coin-sides button").filter({ hasText: "Madrid" });
  await barca.click();
  await page.getByRole("button", { name: "Apostar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar 5 coins" })
    .click();
  await expect(barca).toHaveAttribute("aria-pressed", "true");
  await expect(madrid).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".coin-ticket")).toContainText("5 coins a Barça");
  await expect(page.locator(".coin-ticket")).toContainText(
    "Recibirás si aciertas",
  );
  await expect(page.getByText("Por resolver", { exact: true })).toBeVisible();
  await page.getByText("Administrar coins", { exact: true }).click();
  await page.getByLabel("Activar coins", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Guardar reglas", exact: true })
    .click();
  await expect(
    page.getByText("Reglas de coins guardadas.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".coin-wallet strong")).toHaveText("100");
  await expect(
    page.locator(".coin-ledger").filter({ hasText: "Devuelta" }),
  ).toBeVisible();
});

test("mantiene el registro manual accesible en una tablet pequeña", async ({
  page,
}) => {
  await page.setViewportSize({ width: 853, height: 533 });
  await demo(page);
  await page
    .getByRole("button", { name: "Nueva partida", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nueva partida" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("puede mostrar y ocultar la contraseña sin enviar el formulario", async ({
  page,
}) => {
  await page.goto("/");
  const password = page.getByLabel("Contraseña", { exact: true });
  await password.fill("clave-de-prueba");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Mostrar contraseña", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("clave-de-prueba");
  await page
    .getByRole("button", { name: "Ocultar contraseña", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
});
