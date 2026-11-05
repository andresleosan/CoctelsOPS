import { expect, test } from "@playwright/test";

import {
  cleanupE2EArtifacts,
  getE2EEnvironment,
  loginUser,
  mockWhatsApp,
  newE2ECleanupState,
  setupEmulatorRouteMocks,
} from "./e2e-helpers";

const { baseURL, customerEmail, customerPassword, localNavigationTimeout } = getE2EEnvironment();
const CART_STORAGE_KEY = "coctels_ops_cart";

test.describe("flujo integral de pedido de cliente (order flow)", () => {
  test.use({ baseURL });

  test.beforeEach(async ({ page }) => {
    await setupEmulatorRouteMocks(page);
  });

  test("completa el ciclo de compra: selección, checkout, confirmación, WhatsApp e historial", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    test.skip(!customerEmail || !customerPassword, "Requiere credenciales E2E de cliente.");

    const cleanup = newE2ECleanupState();
    await mockWhatsApp(context);

    try {
      // 1. Iniciar sesión como cliente
      await loginUser(page, customerEmail!, customerPassword!, "/cuenta");

      // 2. Sembrar un producto con personalización real de carta en el carrito
      await page.evaluate((key) => {
        localStorage.setItem(
          key,
          JSON.stringify([
            {
              id: "1::size:8 oz::flavors:Fresa::addons:",
              productId: "1",
              name: "Fresa Salvaje",
              price: 10000,
              quantity: 1,
              image: "",
              customization: { size: "8 oz", flavors: ["Fresa"], addOns: [] },
            },
          ]),
        );
      }, CART_STORAGE_KEY);

      // 3. Navegar a /checkout y comprobar resumen
      await page.goto("/checkout");
      await expect(page.getByRole("heading", { name: "Finalizar Pedido" })).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText("Fresa Salvaje")).toBeVisible();
      await expect(page.getByText("$10.000")).toBeVisible();

      // 4. Llenar los datos de envío
      await page.getByLabel("Nombre Completo").fill("Cliente E2E Automatizado");
      await page.getByLabel("Teléfono de Contacto").fill("300 123 4567");
      await page.getByLabel("Dirección Exacta").fill("Carrera 43A # 1-50, El Poblado");
      await page.getByLabel("Notas o instrucciones de entrega").fill("Dejar en recepción por favor");

      // 5. Confirmar el pedido
      const orderPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/pedidos" && response.request().method() === "POST";
        },
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: "CONFIRMAR PEDIDO" }).click();
      const orderResponse = await orderPromise;
      expect(orderResponse.status()).toBe(201);

      // 6. Verificar redirección a la página de estado del pedido
      await expect(page).toHaveURL(/\/order-status\/([^/?#]+)/, { timeout: 30_000 });
      const orderId = new URL(page.url()).pathname.split("/").pop();
      if (!orderId) throw new Error("No se obtuvo el ID del pedido tras el checkout.");
      cleanup.orderIds.push(orderId);

      // 7. Verificar pantalla de estado del pedido y enlace a WhatsApp
      await expect(page.getByText("Pedido recibido")).toBeVisible({ timeout: localNavigationTimeout });
      await expect(page.getByText(new RegExp(`#${orderId}`))).toBeVisible();

      const popupPromise = context.waitForEvent("page");
      const whatsappButton = page.getByRole("link", { name: "Confirmar por WhatsApp" });
      await expect(whatsappButton).toBeVisible();
      await whatsappButton.click();
      const popup = await popupPromise;
      await expect(popup).toHaveTitle("WhatsApp mock");
      await popup.close();

      // 8. Verificar que el pedido aparece en el historial de la cuenta del cliente
      await page.goto("/cuenta/pedidos");
      await expect(page.getByText(new RegExp(`Pedido #${orderId}`))).toBeVisible({
        timeout: localNavigationTimeout,
      });

      // 9. Acceder al detalle individual del pedido
      const detailLink = page.getByRole("link", { name: "Ver detalle" }).first();
      await expect(detailLink).toBeVisible();
      await detailLink.click();
      await expect(page).toHaveURL(new RegExp(`/cuenta/pedidos/${orderId}(?:$|[?#])`), {
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText("Carrera 43A # 1-50, El Poblado")).toBeVisible();
      await expect(page.getByText("Fresa Salvaje")).toBeVisible();
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("redirige al login si un usuario no autenticado intenta acceder al checkout", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout/, { timeout: localNavigationTimeout });
  });
});
