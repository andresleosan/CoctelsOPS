import { expect, test } from "@playwright/test";

import { getE2EEnvironment, setupEmulatorRouteMocks } from "./e2e-helpers";

const { baseURL, localNavigationTimeout } = getE2EEnvironment();
const CART_STORAGE_KEY = "coctels_ops_cart";

test.describe("experiencia del carrito de compras y personalización", () => {
  test.use({ baseURL });

  test.beforeEach(async ({ page }) => {
    await setupEmulatorRouteMocks(page);
    // Asegurar estado de carrito limpio antes de cada prueba
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), CART_STORAGE_KEY);
  });

  test("agrega un producto al carrito desde el menú con personalización en COP", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/menu");

    // Localizar la tarjeta de Fresa Salvaje y pulsar Personalizar
    const productCard = page.locator("article, div").filter({ hasText: "Fresa Salvaje" }).first();
    await expect(productCard).toBeVisible({ timeout: localNavigationTimeout });

    const customizeButton = page.getByRole("button", { name: "Personalizar Fresa Salvaje" });
    await expect(customizeButton).toBeVisible();
    await customizeButton.click();

    // El diálogo de personalización debe estar visible
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Fresa Salvaje" })).toBeVisible();

    // Seleccionar presentación 16 oz ($15.000) si no está activa
    const size16oz = dialog.locator("label").filter({ hasText: "16 oz" }).first();
    await size16oz.click();

    // Seleccionar sabor Fresa
    const flavorFresa = dialog.locator("label").filter({ hasText: "Fresa" }).first();
    await flavorFresa.click();

    // Seleccionar topping Gomitas (+$1.500)
    const addOnGomitas = dialog.locator("label").filter({ hasText: "Gomitas" }).first();
    await addOnGomitas.click();

    // Verificar que el botón de añadir refleja el precio exacto: $15.000 + $1.500 = $16.500
    const addToCartButton = dialog.getByRole("button", { name: /Agregar al Carrito/i });
    await expect(addToCartButton).toContainText("16.500");
    await addToCartButton.click();

    // El diálogo debe cerrarse y mostrarse en el carrito
    await expect(dialog).not.toBeVisible();

    // Ir a la página del carrito
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: /Tu Pedido/i })).toBeVisible({ timeout: localNavigationTimeout });
    await expect(page.getByText("Fresa Salvaje")).toBeVisible();
    await expect(page.getByText("16 oz")).toBeVisible();
    await expect(page.getByText("Fresa")).toBeVisible();
    await expect(page.getByText("+ Gomitas")).toBeVisible();
    await expect(page.getByText("$16.500")).toBeVisible();
  });

  test("acumula inteligentemente ítems idénticos sin duplicar tarjetas", async ({ page }) => {
    test.setTimeout(60_000);

    // Sembrar un ítem inicial en el carrito con coctels_ops_cart
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: "1::size:16 oz::flavors:Fresa::addons:Gomitas",
            productId: "1",
            name: "Fresa Salvaje",
            price: 16500,
            quantity: 1,
            image: "",
            customization: { size: "16 oz", flavors: ["Fresa"], addOns: ["Gomitas"] },
          },
        ]),
      );
    }, CART_STORAGE_KEY);

    // Navegar al menú y volver a agregar la misma combinación
    await page.goto("/menu");
    const customizeButton = page.getByRole("button", { name: "Personalizar Fresa Salvaje" });
    await customizeButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Seleccionar exactamente 16 oz, Fresa, Gomitas
    await dialog.locator("label").filter({ hasText: "16 oz" }).first().click();
    await dialog.locator("label").filter({ hasText: "Fresa" }).first().click();
    await dialog.locator("label").filter({ hasText: "Gomitas" }).first().click();

    const addToCartButton = dialog.getByRole("button", { name: /Agregar al Carrito/i });
    await addToCartButton.click();
    await expect(dialog).not.toBeVisible();

    // Navegar a /cart y comprobar acumulación
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: /Tu Pedido/i })).toBeVisible({ timeout: localNavigationTimeout });

    // Debe haber un solo encabezado de producto para Fresa Salvaje
    const productHeaders = page.getByRole("heading", { name: "Fresa Salvaje", exact: true });
    await expect(productHeaders).toHaveCount(1);

    // La cantidad debe ser 2
    await expect(page.getByText("2", { exact: true })).toBeVisible();

    // El precio total debe ser $33.000 ($16.500 * 2)
    await expect(page.getByText("$33.000")).toBeVisible();
  });

  test("permite modificar cantidades y eliminar ítems", async ({ page }) => {
    test.setTimeout(60_000);

    // Sembrar ítem en el carrito
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
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
    }, CART_STORAGE_KEY);

    await page.goto("/cart");
    await expect(page.getByText("Fresa Salvaje")).toBeVisible({ timeout: localNavigationTimeout });

    // El botón de disminuir debe estar deshabilitado en cantidad 1
    const decreaseBtn = page.getByRole("button", { name: /disminuir cantidad de fresa salvaje/i });
    await expect(decreaseBtn).toBeDisabled();

    // Incrementar cantidad
    const increaseBtn = page.getByRole("button", { name: /aumentar cantidad de fresa salvaje/i });
    await increaseBtn.click();

    // Ahora la cantidad es 2 y el botón disminuir se habilita
    await expect(page.getByText("2", { exact: true })).toBeVisible();
    await expect(decreaseBtn).not.toBeDisabled();
    await expect(page.getByText("$30.000")).toBeVisible();

    // Disminuir de nuevo a 1
    await decreaseBtn.click();
    await expect(page.getByText("1", { exact: true })).toBeVisible();
    await expect(decreaseBtn).toBeDisabled();

    // Eliminar el ítem con el botón de basura
    const removeBtn = page.getByRole("button", { name: /eliminar fresa salvaje del carrito/i });
    await removeBtn.click();

    // Debe mostrar la vista vacía con enlace al menú
    await expect(page.getByRole("heading", { name: /tu carrito está vacío/i })).toBeVisible();
    const exploreBtn = page.getByRole("link", { name: /explorar el menú/i });
    await expect(exploreBtn).toBeVisible();
    await expect(exploreBtn).toHaveAttribute("href", "/menu");
  });

  test("persiste los productos en localStorage al recargar la página", async ({ page }) => {
    test.setTimeout(60_000);

    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            id: "2::size:8 oz::flavors:Mango Biche::addons:",
            productId: "2",
            name: "Mango Biche Special",
            price: 10000,
            quantity: 2,
            image: "",
            customization: { size: "8 oz", flavors: ["Mango Biche"], addOns: [] },
          },
        ]),
      );
    }, CART_STORAGE_KEY);

    await page.goto("/cart");
    await expect(page.getByText("Mango Biche Special")).toBeVisible({ timeout: localNavigationTimeout });
    await expect(page.getByText("$20.000")).toBeVisible();

    // Recargar página
    await page.reload();

    // Comprobar que sigue presente tras reload
    await expect(page.getByText("Mango Biche Special")).toBeVisible({ timeout: localNavigationTimeout });
    await expect(page.getByText("$20.000")).toBeVisible();

    const storedCart = await page.evaluate((key) => localStorage.getItem(key), CART_STORAGE_KEY);
    expect(storedCart).toContain("Mango Biche Special");
  });
});

