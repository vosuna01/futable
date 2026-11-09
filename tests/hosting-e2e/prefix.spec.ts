import { test, expect } from "@playwright/test";

test("el acceso, los recursos y la navegación funcionan bajo /futable/", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Entrar en la liga" }),
  ).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/futable/manifest.webmanifest",
  );
  await page.getByRole("button", { name: "Explorar demostración" }).click();
  await expect(page.getByRole("heading", { name: /Hola,/ })).toBeVisible();
  await expect(
    page.getByAltText(/Ilustración de un futbolín/).first(),
  ).toBeVisible();
  await page.locator(".live-entry").click();
  await page.getByRole("button", { name: "Fitxo", exact: true }).click();
  await expect(page.locator(".live-queue")).toContainText("Álvaro Martín");
  await page.getByRole("button", { name: "Apuntar a alguien" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Dani Romero/ })
    .click();
  await expect(page.locator(".live-queue")).toContainText("Dani Romero");
  await page
    .getByRole("button", { name: "Mi perfil", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(failures).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("la PWA se instala con su ámbito y recupera la portada sin conexión", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const manifest = await fetch(
      new URL("manifest.webmanifest", location.href),
    ).then((r) => r.json());
    const cache = await caches.open(
      (await caches.keys()).find((k) => k.startsWith("cordoba-shell-"))!,
    );
    return {
      scope: registration?.scope,
      manifest,
      urls: (await cache.keys()).map((r) => r.url),
    };
  });
  expect(state.scope).toBe("http://127.0.0.1:5175/futable/");
  expect(state.manifest.scope).toBe("/futable/");
  expect(state.manifest.start_url).toBe("/futable/");
  expect(
    state.urls.every((url) => url.startsWith("http://127.0.0.1:5175/futable/")),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explorar demostración" }),
  ).toBeVisible();
});
