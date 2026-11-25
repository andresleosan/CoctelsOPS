import { expect, test } from "@playwright/test";

import {
  cleanupE2EArtifacts,
  getE2EEnvironment,
  loginAdmin,
  loginUser,
  logoutAdmin,
  logoutStore,
  newE2ECleanupState,
  setupEmulatorRouteMocks,
} from "./e2e-helpers";

const {
  adminEmail,
  adminPassword,
  baseURL,
  customerEmail,
  customerPassword,
  localNavigationTimeout,
  staffEmail,
  staffPassword,
} = getE2EEnvironment();

const CART_STORAGE_KEY = "coctels_ops_cart";
const SERVICE_STORAGE_KEYS = [
  "coctels_ops_service_mesa",
  "coctels_ops_service_type",
  "coctels_ops_service_negocio_id",
  "coctels_ops_service_tenant_slug",
  "coctels_ops_service_store_name",
] as const;

const MINIMAL_VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test.describe("Fase 11: Autopedido QR en mesa, comprobantes, zonas de entrega y multi-tenancy", () => {
  test.use({ baseURL });

  test.beforeEach(async ({ page }) => {
    await setupEmulatorRouteMocks(page);
  });

  test("Autopedido QR en mesa sin fricción, cuenta en vivo y solicitud de división (TASK-31)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const cleanup = newE2ECleanupState();

    try {
      await page.goto("/");
      await page.evaluate(
        ({ cartKey, serviceKeys }) => {
          localStorage.removeItem(cartKey);
          for (const key of serviceKeys) {
            sessionStorage.removeItem(key);
          }
        },
        { cartKey: CART_STORAGE_KEY, serviceKeys: SERVICE_STORAGE_KEYS },
      );

      // 1. Escanear QR en mesa sin iniciar sesión ni verificar correo
      await page.goto("/menu?mesa=7");
      await expect(page.getByText("Servicio en Mesa 7")).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await expect(page.getByTestId("live-table-tab-bar")).toBeVisible();

      // 2. Personalizar un granizado real (Fresa Salvaje 16 oz + Fresa + Gomitas = $16.500)
      const customizeButton = page.getByRole("button", { name: "Personalizar Fresa Salvaje" });
      await expect(customizeButton).toBeVisible({ timeout: localNavigationTimeout });
      await customizeButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.locator("label").filter({ hasText: "16 oz" }).first().click();
      await dialog.locator("label").filter({ hasText: "Fresa" }).first().click();
      await dialog.locator("label").filter({ hasText: "Gomitas" }).first().click();
      await dialog.getByRole("button", { name: /Agregar al Carrito/i }).click();
      await expect(dialog).not.toBeVisible();

      // 3. Ir a /cart y abrir la cuenta en vivo directamente desde el CTA de mesa
      await page.goto("/cart");
      const sendRoundCta = page.getByRole("button", { name: "Enviar ronda a Mesa 7" });
      await expect(sendRoundCta).toBeVisible({ timeout: localNavigationTimeout });
      await sendRoundCta.click();

      const tabSheet = page.getByRole("dialog", { name: "Cuenta en vivo de Mesa 7" });
      await expect(tabSheet).toBeVisible();

      await tabSheet.locator("#live-tab-customer-name").fill("Mesa E2E QR");
      await tabSheet.locator("#live-tab-round-notes").fill("Sin pitillo");

      const addRoundPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/mesas/Mesa%207" && response.request().method() === "POST"
          );
        },
        { timeout: 30_000 },
      );

      await tabSheet.getByRole("button", { name: /Enviar ronda a barra/i }).click();
      const addRoundResponse = await addRoundPromise;
      expect(addRoundResponse.status()).toBe(201);

      const addRoundBody = (await addRoundResponse.json()) as {
        tab?: { id?: string; total?: number };
        round?: { roundNumber?: number; orderId?: string };
      };
      if (addRoundBody.tab?.id) cleanup.tabIds.push(addRoundBody.tab.id);
      if (addRoundBody.round?.orderId) cleanup.orderIds.push(addRoundBody.round.orderId);
      expect(addRoundBody.round?.roundNumber).toBe(1);
      expect(addRoundBody.tab?.total).toBe(16500);

      await expect(tabSheet.getByText("Ronda #1")).toBeVisible();
      await expect(tabSheet.getByText("Recibida")).toBeVisible();
      await expect(tabSheet.getByText("$16.500").first()).toBeVisible();

      // 4. Solicitar cuenta dividida en 1 tap
      await tabSheet.getByRole("button", { name: /Dividir cuenta/i }).click();
      await tabSheet.getByRole("button", { name: "Nequi", exact: true }).click();

      const billPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/mesas/Mesa%207" && response.request().method() === "POST"
          );
        },
        { timeout: 30_000 },
      );

      await tabSheet.getByRole("button", { name: /Solicitar cuenta a la mesa/i }).click();
      const billResponse = await billPromise;
      expect(billResponse.status()).toBe(200);
      await expect(tabSheet.getByText(/División solicitada entre 2 personas/i)).toBeVisible();

      // 5. Verificar reflejo en /admin/dashboard y /admin/mesas si hay credenciales admin
      if (adminEmail && adminPassword) {
        await loginAdmin(page, adminEmail, adminPassword);
        const tabsKpi = page.getByTestId("dashboard-tabs-kpi");
        await expect(tabsKpi).toBeVisible({ timeout: localNavigationTimeout });
        await expect(tabsKpi).toContainText("Mesa 7");

        await page.goto("/admin/mesas");
        await expect(page.getByText("Mesa 7").first()).toBeVisible({
          timeout: localNavigationTimeout,
        });
        await logoutAdmin(page);
      }
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("Transferencia en checkout, vista previa de comprobante, verificación 1-tap en caja y webhook HMAC fail-closed (TASK-32 & TASK-35)", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    test.skip(
      !customerEmail || !customerPassword || !adminEmail || !adminPassword,
      "Requiere credenciales E2E de cliente y administrador.",
    );

    const cleanup = newE2ECleanupState();

    try {
      await loginUser(page, customerEmail!, customerPassword!, "/cuenta");
      await page.evaluate(
        ({ cartKey, serviceKeys }) => {
          for (const key of serviceKeys) {
            sessionStorage.removeItem(key);
          }
          localStorage.setItem(
            cartKey,
            JSON.stringify([
              {
                id: "1::size:16 oz::flavors:Fresa::addons:",
                productId: "1",
                name: "Fresa Salvaje",
                price: 15000,
                quantity: 1,
                image: "",
                customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
              },
            ]),
          );
        },
        { cartKey: CART_STORAGE_KEY, serviceKeys: SERVICE_STORAGE_KEYS },
      );

      await page.goto("/checkout");
      await expect(page.getByRole("heading", { name: "Finalizar Pedido" })).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await page.getByRole("button", { name: /En Barra/i }).click();
      await page.getByLabel("Nombre Completo").fill("Cliente Transferencia E2E");
      await page.getByLabel("Teléfono de Contacto").fill("3005559988");

      await page.locator('label[for="transfer"]').click();
      await page.getByRole("button", { name: "Nequi", exact: true }).click();
      await page.locator("#transferReference").fill("REF-E2E-170");

      // Validación cliente de archivo inválido y vista previa de PNG válido
      const proofInput = page.locator("#paymentProofFile");
      await proofInput.setInputFiles({
        name: "comprobante.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("GIF89a"),
      });
      await expect(page.getByRole("alert").filter({ hasText: /JPEG, PNG o WebP/i })).toBeVisible();

      await proofInput.setInputFiles({
        name: "comprobante-nequi.png",
        mimeType: "image/png",
        buffer: MINIMAL_VALID_PNG,
      });
      await expect(page.getByText("comprobante-nequi.png")).toBeVisible();
      await expect(page.getByText(/Listo para verificación/i)).toBeVisible();

      // Retirar la captura local antes de enviar para evitar depender de credenciales reales de R2
      await page
        .locator("div.border-cyan-500\\/30")
        .filter({ hasText: "comprobante-nequi.png" })
        .getByRole("button", { name: /Quitar/i })
        .click();
      await expect(page.getByText("comprobante-nequi.png")).toHaveCount(0);

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

      const orderBody = (await orderResponse.json()) as {
        order?: {
          id?: string;
          paymentMethod?: string;
          paymentVerificationStatus?: string;
        };
      };
      const orderId = orderBody.order?.id;
      if (!orderId) throw new Error("No se obtuvo el ID del pedido por transferencia.");
      cleanup.orderIds.push(orderId);
      expect(orderBody.order?.paymentMethod).toBe("nequi");
      expect(orderBody.order?.paymentVerificationStatus).toBe("pendiente_verificacion");

      await expect(page).toHaveURL(new RegExp(`/order-status/${orderId}(?:$|[?#])`), {
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText("Estado de Pago por Transferencia")).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText("Pago por verificar")).toBeVisible();

      // Webhook HMAC de pasarela debe fallar cerrado (401 o 503, nunca 2xx)
      const webhookResponse = await page.request.post("/api/webhooks/payments?provider=wompi", {
        data: {
          event: "transaction.updated",
          data: { transaction: { id: "tx-e2e-invalid", reference: orderId, status: "APPROVED" } },
          signature: { checksum: "firma-invalida" },
        },
      });
      expect([401, 503]).toContain(webhookResponse.status());

      await logoutStore(page);

      // Verificación 1-tap desde /admin/caja
      await loginAdmin(page, adminEmail!, adminPassword!);
      await page.goto("/admin/caja");

      const verificationsCard = page.getByTestId("cash-transfer-verifications-card");
      await expect(verificationsCard).toBeVisible({ timeout: localNavigationTimeout });

      const transferRow = page.getByTestId(`cash-transfer-row-${orderId}`);
      await expect(transferRow).toBeVisible({ timeout: localNavigationTimeout });

      const verifyPromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/pedidos/${orderId}/comprobante`) &&
          response.request().method() === "PATCH",
        { timeout: 30_000 },
      );

      await page.getByTestId(`btn-verify-payment-${orderId}`).click();
      const verifyResponse = await verifyPromise;
      expect(verifyResponse.status()).toBe(200);
      const verifyBody = (await verifyResponse.json()) as {
        paymentVerificationStatus?: string;
      };
      expect(verifyBody.paymentVerificationStatus).toBe("verificado");

      // Confirmar badge verificado en /admin/pedidos/[id]
      await page.goto(`/admin/pedidos/${orderId}`);
      await expect(page.getByTestId(`payment-verification-badge-${orderId}`)).toContainText(
        "Pago verificado",
        { timeout: localNavigationTimeout },
      );
      await logoutAdmin(page);
    } finally {
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("Zonas de cobertura dinámicas en configuración/checkout y entrega completa desde /repartidor (TASK-34)", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    test.skip(
      !customerEmail || !customerPassword || !adminEmail || !adminPassword,
      "Requiere credenciales E2E de cliente y administrador.",
    );

    const cleanup = newE2ECleanupState();
    let originalConfiguration: Record<string, unknown> | null = null;
    let adminAuthHeader: string | undefined;

    try {
      await loginAdmin(page, adminEmail!, adminPassword!);

      const configGetPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/admin/configuration" && response.request().method() === "GET"
          );
        },
        { timeout: 30_000 },
      );

      await page.goto("/admin/configuracion");
      const configGetResponse = await configGetPromise;
      adminAuthHeader = configGetResponse.request().headers()["authorization"];
      if (configGetResponse.ok()) {
        const configJson = (await configGetResponse.json()) as {
          configuration?: Record<string, unknown>;
        };
        originalConfiguration = configJson.configuration ?? null;
      }

      const zonesEditor = page.getByTestId("delivery-zones-editor");
      await expect(zonesEditor).toBeVisible({ timeout: localNavigationTimeout });

      await page.locator("#zone-name-0").fill("Laureles");
      await page.locator("#zone-fee-0").fill("4000");
      await page.locator("#zone-eta-0").fill("35");

      if ((await page.locator("#zone-name-1").count()) === 0) {
        await page.getByTestId("btn-add-delivery-zone").click();
      }
      await page.locator("#zone-name-1").fill("El Poblado");
      await page.locator("#zone-fee-1").fill("6000");
      await page.locator("#zone-eta-1").fill("45");

      const saveConfigPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/admin/configuration" && response.request().method() === "PUT"
          );
        },
        { timeout: 30_000 },
      );

      await page.getByRole("button", { name: /Guardar configuración/i }).click();
      const saveConfigResponse = await saveConfigPromise;
      expect(saveConfigResponse.status()).toBe(200);
      await expect(page.getByRole("status")).toContainText("Configuración guardada.");

      await logoutAdmin(page);

      // Cliente selecciona zona dinámica El Poblado en /checkout
      await loginUser(page, customerEmail!, customerPassword!, "/cuenta");
      await page.evaluate(
        ({ cartKey, serviceKeys }) => {
          for (const key of serviceKeys) {
            sessionStorage.removeItem(key);
          }
          localStorage.setItem(
            cartKey,
            JSON.stringify([
              {
                id: "1::size:16 oz::flavors:Fresa::addons:",
                productId: "1",
                name: "Fresa Salvaje",
                price: 15000,
                quantity: 1,
                image: "",
                customization: { size: "16 oz", flavors: ["Fresa"], addOns: [] },
              },
            ]),
          );
        },
        { cartKey: CART_STORAGE_KEY, serviceKeys: SERVICE_STORAGE_KEYS },
      );

      await page.goto("/checkout");
      await expect(page.getByTestId("checkout-delivery-zones")).toBeVisible({
        timeout: localNavigationTimeout,
      });

      const pobladoZoneBtn = page.getByTestId("checkout-zone-el-poblado");
      await expect(pobladoZoneBtn).toBeVisible();
      await pobladoZoneBtn.click();

      await expect(page.getByTestId("checkout-summary-delivery-fee")).toContainText("6.000");

      await page.getByLabel("Nombre Completo").fill("Cliente Zona E2E");
      await page.getByLabel("Teléfono de Contacto").fill("3007778899");
      await page.getByLabel("Dirección Exacta").fill("Calle 10 # 43E-15");

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

      const orderBody = (await orderResponse.json()) as {
        order?: {
          id?: string;
          deliveryZoneName?: string;
          deliveryFee?: number;
          total?: number;
        };
      };
      const orderId = orderBody.order?.id;
      if (!orderId) throw new Error("No se obtuvo el ID del pedido por zona dinámica.");
      cleanup.orderIds.push(orderId);
      expect(orderBody.order?.deliveryZoneName).toBe("El Poblado");
      expect(orderBody.order?.deliveryFee).toBe(6000);
      expect(orderBody.order?.total).toBe(21000);

      await expect(page).toHaveURL(new RegExp(`/order-status/${orderId}(?:$|[?#])`), {
        timeout: localNavigationTimeout,
      });
      await expect(page.getByText("El Poblado").first()).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await logoutStore(page);

      // Tablero multi-pedido /repartidor -> reclamar, salir a ruta y confirmar entrega
      await loginAdmin(page, adminEmail!, adminPassword!);
      await page.goto("/repartidor");

      await expect(page.getByTestId("driver-queue-board")).toBeVisible({
        timeout: localNavigationTimeout,
      });
      await page.getByTestId("filter-zone-El Poblado").click();
      await expect(page.getByTestId(`driver-queue-card-${orderId}`)).toBeVisible({
        timeout: localNavigationTimeout,
      });

      const claimPromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/pedidos/${orderId}/repartidor`) &&
          response.request().method() === "PATCH",
        { timeout: 30_000 },
      );
      await page.getByTestId(`btn-claim-order-${orderId}`).click();
      expect((await claimPromise).status()).toBe(200);

      const startRoutePromise = page.waitForResponse(
        async (response) => {
          if (
            !response.url().endsWith(`/api/pedidos/${orderId}`) ||
            response.request().method() !== "PATCH" ||
            response.status() !== 200
          ) {
            return false;
          }
          const payload = (await response.json().catch(() => ({}))) as {
            order?: { status?: string };
          };
          return payload.order?.status === "en_camino";
        },
        { timeout: 30_000 },
      );
      await page.getByTestId(`btn-queue-start-route-${orderId}`).click();
      const routeResponse = await startRoutePromise;
      expect(routeResponse.status()).toBe(200);

      await page.getByTestId(`btn-open-delivery-${orderId}`).click();
      await expect(page).toHaveURL(new RegExp(`/repartidor/${orderId}(?:$|[?#])`), {
        timeout: localNavigationTimeout,
      });

      await page.getByTestId("checkbox-payment-collected").check();

      const confirmDeliveryPromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/pedidos/${orderId}`) &&
          response.request().method() === "PATCH",
        { timeout: 30_000 },
      );
      await page.getByTestId("btn-confirm-delivery").click();
      expect((await confirmDeliveryPromise).status()).toBe(200);

      await expect(page.getByTestId("driver-delivered-banner")).toBeVisible({
        timeout: localNavigationTimeout,
      });
    } finally {
      if (originalConfiguration && adminAuthHeader) {
        try {
          await page.request.put("/api/admin/configuration", {
            headers: {
              authorization: adminAuthHeader,
              "content-type": "application/json",
            },
            data: originalConfiguration,
          });
        } catch {
          // Best-effort restore on emulator teardown
        }
      }
      await cleanupE2EArtifacts(cleanup);
    }
  });

  test("Aislamiento multi-tenant fail-closed y KPIs operativos en /admin/dashboard (TASK-33)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Endpoints protegidos rechazan peticiones anónimas con 401
    for (const protectedPath of [
      "/api/admin/caja",
      "/api/admin/mesas",
      "/api/admin/insumos",
      "/api/admin/recetas",
    ]) {
      const response = await page.request.get(protectedPath);
      expect(response.status()).toBe(401);
    }

    // Tenant inexistente falla cerrado (404)
    const missingTenantRes = await page.request.get(
      "/api/mesas/Mesa%201?negocioId=tenant-inexistente-e2e",
    );
    expect(missingTenantRes.status()).toBe(404);

    if (adminEmail && adminPassword) {
      await loginAdmin(page, adminEmail, adminPassword);
      const cashKpi = page.getByTestId("dashboard-cash-kpi");
      const tabsKpi = page.getByTestId("dashboard-tabs-kpi");
      await expect(cashKpi).toBeVisible({ timeout: localNavigationTimeout });
      await expect(tabsKpi).toBeVisible({ timeout: localNavigationTimeout });
      await expect(cashKpi.getByRole("link", { name: /Ir a Caja/i })).toHaveAttribute(
        "href",
        "/admin/caja",
      );
      await expect(tabsKpi.getByRole("link", { name: /Ir a Mesas/i })).toHaveAttribute(
        "href",
        "/admin/mesas",
      );
      await logoutAdmin(page);
    }

    if (staffEmail && staffPassword) {
      await loginUser(page, staffEmail, staffPassword, "/admin/dashboard");
      await expect(page.getByTestId("dashboard-cash-kpi")).toBeVisible({
        timeout: localNavigationTimeout,
      });

      await page.goto("/admin/configuracion");
      await expect(page.getByText("No tienes permisos para ver esta sección.")).toBeVisible({
        timeout: localNavigationTimeout,
      });
    }
  });
});
