import { test, expect } from "@playwright/test";
test("muestra la fecha y la cuenta atrás de Madrid y termina sin cerrar la temporada", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-11T12:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  const banner = page.getByRole("region", { name: "Cierre de temporada" });
  await expect(banner).toContainText("viernes, 27 de noviembre");
  await expect(banner).toContainText("23:59 · hora de Madrid");
  await expect(banner.getByRole("timer")).toHaveAttribute(
    "aria-label",
    "Quedan 16 días, 11 horas, 0 minutos y 0 segundos",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.clock.setFixedTime(new Date("2026-11-27T23:00:01Z"));
  await expect(banner).toContainText("Plazo finalizado");
  await expect(banner.getByRole("timer")).toHaveCount(0);
  await expect(
    page.getByText("TEMPORADA EN JUEGO", { exact: true }),
  ).toBeVisible();
});
