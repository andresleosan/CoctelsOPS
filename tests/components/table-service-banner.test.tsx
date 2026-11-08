import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import TableServiceBanner, {
  SERVICE_MESA_STORAGE_KEY,
  SERVICE_TYPE_STORAGE_KEY,
} from "@/components/products/TableServiceBanner";

describe("TableServiceBanner Component", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("does not render when no mesa is passed or stored", () => {
    const { container } = render(<TableServiceBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders table service banner and stores in sessionStorage when mesa prop is passed", () => {
    render(<TableServiceBanner initialMesa="4" />);

    expect(screen.getByText(/Servicio en Mesa 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Consumo en Local/i)).toBeInTheDocument();

    expect(window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY)).toBe("Mesa 4");
    expect(window.sessionStorage.getItem(SERVICE_TYPE_STORAGE_KEY)).toBe("mesa");
  });

  it("renders barra service banner when mesa is 'Barra'", () => {
    render(<TableServiceBanner initialMesa="Barra" />);

    expect(screen.getByText(/Retiro en Barra Activo/i)).toBeInTheDocument();
    expect(screen.getByText(/barra principal/i)).toBeInTheDocument();

    expect(window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY)).toBe("Recoger en Barra");
    expect(window.sessionStorage.getItem(SERVICE_TYPE_STORAGE_KEY)).toBe("pickup");
  });

  it("clears banner and sessionStorage when close button is clicked", () => {
    const { container } = render(<TableServiceBanner initialMesa="Mesa 7" />);

    expect(screen.getByText(/Servicio en Mesa 7/i)).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: /Quitar mesa/i });
    fireEvent.click(clearBtn);

    expect(container).toBeEmptyDOMElement();
    expect(window.sessionStorage.getItem(SERVICE_MESA_STORAGE_KEY)).toBeNull();
  });
});
