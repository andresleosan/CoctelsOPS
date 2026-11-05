import { expect, test } from "@playwright/test";

import {
  cleanupE2EArtifacts,
  getE2EEnvironment,
  loginAdmin,
  loginUser,
  newE2ECleanupState,
  setupEmulatorRouteMocks,
} from "./e2e-helpers";

const { adminEmail, adminPassword, baseURL, localNavigationTimeout, staffEmail, staffPassword } =
  getE2EEnvironment();

test.describe("panel staff y gestión del menú en tiempo real", () => {
  test.use({ baseURL });

  test.beforeEach(async ({ page }) => {
    await setupEmulatorRouteMocks(page);
  });

  test("permite al administrador alternar disponibilidad de stock en tiempo real", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!adminEmail || !adminPassword, "Requiere credenciales E2E de administrador.");

    await loginAdmin(page, adminEmail!, adminPassword!);
    await page.goto("/admin/productos");

    await expect(page.getByRole("heading", { name: "Control de Menú y Productos" })).toBeVisible({
      timeout: localNavigationTimeout,
    });

    // Localizar Fresa Salvaje
    const productCard = page.locator("div.border-slate-200").filter({ hasText: "Fresa Salvaje" }).first();
    await expect(productCard).toBeVisible({ timeout: localNavigationTimeout });

    // Alternar a agotado
    const agotadoButton = productCard.getByRole("button", { name: /agotar|marcar.*como agotado/i });
    const patchToAgotado = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return url.pathname.includes("/api/admin/productos") && response.request().method() === "PATCH";
      },
      { timeout: 30_000 },
    );
    await agotadoButton.click();
    expect((await patchToAgotado).status()).toBe(200);

    // Debe mostrar la insignia de Agotado
    await expect(productCard.getByText("Agotado")).toBeVisible();

    // Restaurar a En Stock
    const enStockButton = productCard.getByRole("button", { name: /en stock|marcar.*como en stock/i });
    const patchToEnStock = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return url.pathname.includes("/api/admin/productos") && response.request().method() === "PATCH";
      },
      { timeout: 30_000 },
    );
    await enStockButton.click();
    expect((await patchToEnStock).status()).toBe(200);

    // Debe volver a mostrar stock numérico positivo
    await expect(productCard.getByText(/Stock: \d+/)).toBeVisible();
  });

  test("permite crear un nuevo producto con precio en COP y verificarlo en el menú público", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!adminEmail || !adminPassword, "Requiere credenciales E2E de administrador.");

    const cleanup = newE2ECleanupState();

    try {
      await loginAdmin(page, adminEmail!, adminPassword!);
      await page.goto("/admin/productos/nueva");

      await expect(page.getByRole("heading", { name: "Nuevo Producto" })).toBeVisible({
        timeout: localNavigationTimeout,
      });

      // Llenar datos requeridos
      const productName = `Granizado Silvestre E2E ${Date.now()}`;
      await page.getByLabel("Nombre del Producto").fill(productName);
      await page.getByLabel("Precio Base (COP)").fill("14000");
      await page.getByLabel("Descripción").fill("Granizado artesanal de prueba automatizada Playwright");
      await page.getByLabel("Stock Inicial").fill("30");

      // Esperar la creación del producto
      const createResponsePromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/admin/productos" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: "Guardar producto" }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      const data = (await createResponse.json()) as { id?: string };
      if (data.id) cleanup.productIds.push(data.id);

      // Debe redirigir al listado de productos
      await expect(page).toHaveURL(/\/admin\/productos(?:$|[?#])/, { timeout: localNavigationTimeout });
      await expect(page.getByText(productName)).toBeVisible({ timeout: localNavigationTimeout });

      // Verificar que el nuevo producto aparece en el menú público
      await page.goto("/menu");
      await expect(page.getByText(productName)).toBeVisible({ timeout: localNavigationTimeout });
      await expect(page.getByText("$14.000 COP")).toBeVisible();
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("restringe el acceso al catálogo a cuentas staff sin permisos suficientes", async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!staffEmail || !staffPassword, "Requiere credenciales E2E de staff.");

    // Iniciar sesión como staff (que no tiene permisos de productos en los seeds)
    await loginUser(page, staffEmail!, staffPassword!, "/admin/dashboard");

    // Verificar que la navegación no muestra "Productos"
    const navigation = page.getByRole("navigation", { name: "Navegación de administración" });
    await expect(navigation.getByRole("link", { name: "Productos" })).toHaveCount(0);

    // Intentar navegar directamente a /admin/productos
    await page.goto("/admin/productos");

    // AdminGuard debe bloquear el acceso
    await expect(page.getByText("No tienes permisos para ver esta sección.")).toBeVisible({
      timeout: localNavigationTimeout,
    });
  });
});
