import { expect, test } from "@playwright/test";

import {
  cleanupE2EArtifacts,
  getE2EEnvironment,
  loginAdmin,
  newE2ECleanupState,
  setupEmulatorRouteMocks,
} from "./e2e-helpers";

const { adminEmail, adminPassword, baseURL, localNavigationTimeout } = getE2EEnvironment();
const CART_STORAGE_KEY = "coctels_ops_cart";

test.describe("Fases 8-9: Terminal POS en barra, Escandallo y Opsy Bot", () => {
  test.use({ baseURL });

  test.beforeEach(async ({ page }) => {
    await setupEmulatorRouteMocks(page);
  });

  test("Opsy Bot recomienda productos reales y arma el carrito persistente en /cart", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), CART_STORAGE_KEY);

    const launcher = page.getByRole("button", { name: "Abrir asistente Opsy Bot" });
    await expect(launcher).toBeVisible({ timeout: localNavigationTimeout });
    await launcher.click();

    const dialog = page.getByRole("dialog", { name: "Chat con Opsy Bot" });
    await expect(dialog).toBeVisible();

    const chatResponsePromise = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          (url.pathname === "/api/opsy/chat" || url.pathname === "/api/chat") &&
          response.request().method() === "POST"
        );
      },
      { timeout: 30_000 },
    );

    await dialog.getByRole("button", { name: "🍹 ¿Qué me recomiendas cítrico?" }).click();
    const chatResponse = await chatResponsePromise;
    expect(chatResponse.status()).toBe(200);

    await expect(dialog.getByText("Recomendaciones de Opsy (toca para agregar al pedido):")).toBeVisible({
      timeout: localNavigationTimeout,
    });

    const size16OzBtn = dialog.getByRole("button", { name: /^Agregar .+ 16 oz$/i }).first();
    if ((await size16OzBtn.count()) > 0) {
      await size16OzBtn.click();
    } else {
      const quickAddBtn = dialog.locator('button[aria-label^="Agregar "]').first();
      await expect(quickAddBtn).toBeVisible();
      await quickAddBtn.click();
    }

    const miniCart = dialog.getByTestId("opsy-mini-cart");
    await expect(miniCart).toBeVisible();
    await expect(miniCart).toContainText("Tu pedido (1 producto)");

    await miniCart.getByRole("link", { name: "Carrito", exact: true }).click();
    await expect(page).toHaveURL(/\/cart(?:$|[?#])/, { timeout: localNavigationTimeout });
    await expect(page.getByRole("heading", { name: /Tu Pedido/i })).toBeVisible({
      timeout: localNavigationTimeout,
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: /Tu Pedido/i })).toBeVisible({
      timeout: localNavigationTimeout,
    });

    const persistedCart = await page.evaluate((key) => localStorage.getItem(key), CART_STORAGE_KEY);
    expect(persistedCart).toBeTruthy();
    expect(JSON.parse(persistedCart!)).toHaveLength(1);
  });

  test("Terminal POS rápido calcula vueltas en efectivo, procesa cobro mixto y envía comanda en /admin/pedidos", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!adminEmail || !adminPassword, "Requiere credenciales E2E de administrador.");

    const cleanup = newE2ECleanupState();

    try {
      await loginAdmin(page, adminEmail!, adminPassword!);
      await page.goto("/admin/pedidos");

      await expect(page.getByTestId("btn-open-quick-pos")).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await page.getByTestId("btn-open-quick-pos").click();

      const modal = page.getByTestId("quick-bar-pos-modal");
      await expect(modal).toBeVisible();
      await expect(modal.getByTestId("pos-product-card-1")).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await modal.getByTestId("pos-customize-1").click();
      const customizer = modal.getByTestId("pos-inline-customizer");
      await expect(customizer).toBeVisible();

      await customizer.getByRole("button", { name: /16 oz/i }).click();
      await customizer.getByRole("button", { name: "Fresa", exact: true }).click();
      await customizer.getByRole("button", { name: /Gomitas/i }).click();

      const confirmCustomizeBtn = customizer.getByTestId("pos-confirm-customize");
      await expect(confirmCustomizeBtn).toContainText("16.500");
      await confirmCustomizeBtn.click();

      await expect(modal.getByTestId("pos-ticket-line-1")).toBeVisible();
      await expect(modal.getByTestId("pos-order-total")).toContainText("16.500");

      await modal.getByTestId("pos-service-mesa").click();
      await modal.getByRole("button", { name: "M4", exact: true }).click();
      await modal.getByLabel("Cliente (opcional)").fill("Mesa POS E2E");

      await modal.getByTestId("pos-method-efectivo").click();
      await modal.getByTestId("pos-cash-received-input").fill("20000");
      await expect(modal.getByTestId("pos-change-display")).toContainText("3.500");

      await modal.getByTestId("pos-method-mixto").click();
      await modal.getByTestId("pos-mixed-channel-nequi").click();
      await modal.getByTestId("pos-mixed-digital-input").fill("10000");
      await modal.getByTestId("pos-cash-received-input").fill("10000");
      await expect(modal.getByTestId("pos-change-display")).toContainText("3.500");
      await modal.getByTestId("pos-digital-reference-input").fill("NEQ-4821");

      const submitPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/pedidos" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await modal.getByTestId("pos-submit-order").click();
      const submitResponse = await submitPromise;
      expect(submitResponse.status()).toBe(201);

      const submitBody = (await submitResponse.json()) as {
        order?: { id?: string; total?: number; paymentMethod?: string };
      };
      if (submitBody.order?.id) cleanup.orderIds.push(submitBody.order.id);
      expect(submitBody.order?.total).toBe(16500);
      expect(submitBody.order?.paymentMethod).toBe("mixto");

      const successBanner = modal.getByTestId("pos-last-order-banner");
      await expect(successBanner).toBeVisible();
      await expect(successBanner).toContainText("Comanda cobrada y enviada a barra");
      await expect(successBanner).toContainText("3.500");

      await modal.getByRole("button", { name: "Cerrar terminal POS" }).click();
      await expect(modal).not.toBeVisible();

      await expect(page.getByText("Mesa POS E2E")).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText(/Mixto:/i).first()).toBeVisible();
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("Escandallo en /admin/inventario descuenta automáticamente los insumos al preparar un pedido", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    test.skip(!adminEmail || !adminPassword, "Requiere credenciales E2E de administrador.");

    const cleanup = newE2ECleanupState();
    const stamp = Date.now();
    const supplyName = `Pulpa Fresa Escandallo E2E ${stamp}`;

    try {
      await loginAdmin(page, adminEmail!, adminPassword!);
      await page.goto("/admin/inventario");

      await expect(page.getByRole("heading", { name: "Inventario y Materia Prima" })).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await page.getByRole("button", { name: "Nuevo Insumo" }).click();
      await page.getByLabel("Nombre del Insumo").fill(supplyName);
      await page.getByLabel("Categoría").selectOption("pulpa");
      await page.getByLabel("Unidad de Medida").selectOption("ml");
      await page.getByLabel("Stock Inicial").fill("1000");
      await page.getByLabel("Stock Mínimo (Alerta)").fill("200");
      await page.getByLabel("Costo Unitario (COP)").fill("15");

      const createSupplyPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/admin/insumos" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: "Crear Insumo" }).click();
      const supplyResponse = await createSupplyPromise;
      expect(supplyResponse.status()).toBe(201);

      const supplyBody = (await supplyResponse.json()) as { supply?: { id?: string } };
      const supplyId = supplyBody.supply?.id;
      if (!supplyId) throw new Error("No se obtuvo el ID del insumo creado.");
      cleanup.supplyIds.push(supplyId);

      await expect(page.getByText(supplyName)).toBeVisible({ timeout: localNavigationTimeout });

      await page.getByRole("button", { name: "Recetas y Escandallo" }).click();
      await expect(page.getByRole("button", { name: "Nueva Receta" })).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await page.getByRole("button", { name: "Nueva Receta" }).click();

      const recipeDialog = page.getByRole("dialog", { name: "Nueva Receta y Escandallo" });
      await expect(recipeDialog).toBeVisible();

      await recipeDialog.getByLabel("Producto de carta").selectOption("1");
      await recipeDialog.getByLabel("Presentación / Vaso").selectOption("16 oz");
      await recipeDialog.getByLabel("Insumo #1").selectOption(supplyId);
      await recipeDialog.getByLabel("Cantidad").fill("100");

      await expect(recipeDialog).toContainText("$15.000");
      await expect(recipeDialog).toContainText("$1.500");
      await expect(recipeDialog).toContainText("90%");
      await expect(recipeDialog).toContainText("Saludable");

      const createRecipePromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/admin/recetas" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await recipeDialog.getByRole("button", { name: "Guardar Receta" }).click();
      const recipeResponse = await createRecipePromise;
      expect(recipeResponse.status()).toBe(201);

      const recipeBody = (await recipeResponse.json()) as { recipe?: { id?: string } };
      if (recipeBody.recipe?.id) cleanup.recipeIds.push(recipeBody.recipe.id);

      await expect(recipeDialog).not.toBeVisible();

      await page.goto("/admin/pedidos");
      await page.getByTestId("btn-open-quick-pos").click();
      const modal = page.getByTestId("quick-bar-pos-modal");
      await expect(modal.getByTestId("pos-product-card-1")).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await modal.getByTestId("pos-customize-1").click();
      const customizer = modal.getByTestId("pos-inline-customizer");
      await customizer.getByRole("button", { name: /16 oz/i }).click();
      await customizer.getByTestId("pos-confirm-customize").click();

      const createOrderPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/pedidos" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await modal.getByTestId("pos-submit-order").click();
      const orderResponse = await createOrderPromise;
      expect(orderResponse.status()).toBe(201);
      const orderBody = (await orderResponse.json()) as { order?: { id?: string } };
      const orderId = orderBody.order?.id;
      if (!orderId) throw new Error("No se obtuvo el ID del pedido POS.");
      cleanup.orderIds.push(orderId);

      await page.goto(`/admin/pedidos/${orderId}`);
      await expect(page.getByRole("heading", { name: `#${orderId}` })).toBeVisible({
        timeout: localNavigationTimeout,
      });

      page.on("dialog", (dialog) => void dialog.accept());

      const confirmPromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/pedidos/${orderId}`) && response.request().method() === "PATCH",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /^confirmar$/i }).click();
      expect((await confirmPromise).status()).toBe(200);

      const preparePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/pedidos/${orderId}`) && response.request().method() === "PATCH",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: /^preparar$/i }).click();
      const prepareResponse = await preparePromise;
      expect(prepareResponse.status()).toBe(200);

      const prepareBody = (await prepareResponse.json()) as {
        order?: {
          status?: string;
          suppliesDepletedAt?: string;
          escandallo?: { totalCostCop?: number };
        };
      };
      expect(prepareBody.order?.status).toBe("preparando");
      expect(Boolean(prepareBody.order?.suppliesDepletedAt)).toBe(true);
      expect(prepareBody.order?.escandallo?.totalCostCop).toBe(1500);

      await page.goto("/admin/inventario");
      await expect(page.getByText(supplyName)).toBeVisible({ timeout: localNavigationTimeout });
      await expect(page.getByText("900").first()).toBeVisible({ timeout: localNavigationTimeout });
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("mantiene oculto Opsy Bot en rutas administrativas (/admin/*)", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!adminEmail || !adminPassword, "Requiere credenciales E2E de administrador.");

    await loginAdmin(page, adminEmail!, adminPassword!);

    await page.goto("/admin/pedidos");
    await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible({
      timeout: localNavigationTimeout,
    });
    await expect(page.getByRole("button", { name: "Abrir asistente Opsy Bot" })).toHaveCount(0);

    await page.goto("/admin/inventario");
    await expect(page.getByRole("heading", { name: "Inventario y Materia Prima" })).toBeVisible({
      timeout: localNavigationTimeout,
    });
    await expect(page.getByRole("button", { name: "Abrir asistente Opsy Bot" })).toHaveCount(0);
  });
});
