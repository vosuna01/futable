import { test, expect, type Page } from "@playwright/test";
import { createDemo } from "../../src/demo/data";
import { COSMETICS } from "../../src/domain/cosmetics";
const user = "91000000-0000-4000-8000-000000000001";
async function setup(page: Page) {
  const data = createDemo();
  const old = data.seasons[0];
  old.status = "closed";
  const next = {
    ...old,
    id: "91000000-0000-4000-8000-000000000002",
    status: "active" as const,
    name: "Temporada 2 · Liga Mediodía",
    competition_kind: "league" as const,
    rating_epoch: "91000000-0000-4000-8000-000000000003",
    minimum_days: 3,
    final_results: null,
  };
  data.seasons = [next, old];
  data.league.competitions_enabled = true;
  data.players[0].account_id = user;
  data.loadouts = {};
  let seen = false,
    balance = 100;
  const owned: string[] = [];
  let equipped: string[] = [];
  const wallet = {
    id: "wallet",
    player_id: data.players[0].id,
    balance,
    score: 100,
    name: data.players[0].name,
  };
  const auth = {
    access_token:
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(JSON.stringify({ sub: user, exp: 4102444800 })).toString(
        "base64url",
      ) +
      ".fixture",
    refresh_token: "fixture",
    expires_at: 4102444800,
    expires_in: 99999999,
    token_type: "bearer",
    user: {
      id: user,
      email: "fixture@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
    },
  };
  await page.addInitScript(
    ({ auth }) => {
      localStorage.setItem(
        "sb-foogrwxbycncnifbwlpe-auth-token",
        JSON.stringify(auth),
      );
      localStorage.setItem("futable:whats-new-seen", "2026-11-25-sesion");
    },
    { auth },
  );
  await page.route(
    "https://foogrwxbycncnifbwlpe.supabase.co/**",
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        endpoint = url.pathname.split("/").pop();
      let body: unknown = null;
      if (req.method() === "OPTIONS")
        return route.fulfill({ status: 200, body: "" });
      if (url.pathname.includes("/auth/"))
        body = endpoint === "user" ? auth.user : auth;
      else if (endpoint === "league_memberships")
        body = [{ league_id: data.league.id }];
      else if (endpoint === "league_snapshot") body = data;
      else if (endpoint === "live_sessions") body = null;
      else if (endpoint === "season_recap_seen") {
        if (req.method() === "POST") {
          seen = true;
          body = null;
        } else body = seen ? [{ version: 1 }] : [];
      } else if (endpoint === "coins_snapshot")
        body = {
          settings: {
            enabled: true,
            initial: 100,
            win_bonus: 5,
            max_stake: 25,
          },
          player_id: data.players[0].id,
          wallet: { ...wallet, balance },
          standings: [{ ...wallet, balance }],
          ledger: [],
          bets: [],
          market: null,
          honours: [
            {
              season_id: old.id,
              published_at: new Date().toISOString(),
              awards: [
                {
                  title: "Campeón de liga",
                  players: [
                    { id: data.players[0].id, name: data.players[0].name },
                  ],
                },
              ],
            },
          ],
        };
      else if (endpoint === "shop_snapshot")
        body = {
          player_id: data.players[0].id,
          catalog: COSMETICS,
          owned,
          equipped,
        };
      else if (endpoint === "shop_command") {
        const { p_action, p_input } = req.postDataJSON();
        if (p_action === "buy") {
          owned.push(p_input.item_id);
          balance -= 40;
        } else {
          equipped = p_input.items;
          data.loadouts = { [data.players[0].id]: equipped };
        }
      } else throw Error("Unexpected backend request: " + req.url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  return { data, seen: () => seen, balance: () => balance };
}
test("first opening shows recap, explains reset and remembers dismissal", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("La pista");
  await dialog.getByRole("button", { name: "Pausar", exact: true }).click();
  await dialog.getByLabel("Escena siguiente").click();
  await expect(dialog).toContainText("Campeón de liga");
  await dialog.getByLabel("Escena siguiente").click();
  await expect(dialog).toContainText(state.data.players[0].name);
  await dialog.getByLabel("Escena siguiente").click();
  await expect(dialog).toContainText("de 1000.");
  await dialog.getByLabel("Escena siguiente").click();
  await dialog
    .getByRole("button", { name: "Entrar en la nueva temporada" })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(state.seen()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Ver cierre e intro/ }),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
});
test("shop previews, confirms purchase and equips without reducing coins score", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saltar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Club", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Vestuario · Personalizar/ }).click();
  const item = page.locator(".shop-item").filter({ hasText: "Gafas Pro" });
  await item.getByRole("button", { name: "Probar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guardar conjunto" }),
  ).toBeDisabled();
  await item.getByRole("button", { name: "Comprar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("40 coins");
  await page
    .getByRole("button", { name: "Confirmar compra · 40 coins" })
    .click();
  await expect(item).toContainText("En tu inventario");
  expect(state.balance()).toBe(60);
  await page.getByRole("button", { name: "Guardar conjunto" }).click();
  await expect(page.getByRole("status")).toContainText("Conjunto guardado");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
