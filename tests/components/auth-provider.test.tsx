import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, onIdTokenChanged, fetchMock } = vi.hoisted(() => ({
  auth: { name: "auth" },
  onIdTokenChanged: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/firebase", () => ({
  useFirebase: () => ({ auth }),
}));
vi.mock("firebase/auth", () => ({ onIdTokenChanged }));

import { AuthProvider, useAuthContext } from "@/components/auth/AuthProvider";

function SessionProbe() {
  const { loading, user } = useAuthContext();
  return createElement("output", null, loading ? "loading" : user?.uid ?? "anonymous");
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("sincroniza un usuario recién autenticado antes de acceder a APIs protegidas", async () => {
    const user = {
      uid: "customer-new",
      email: "nuevo@example.com",
      emailVerified: true,
      getIdTokenResult: vi.fn().mockResolvedValue({ token: "fresh-token", claims: { admin: false } }),
    };
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (nextUser: typeof user) => void) => {
      void callback(user);
      return vi.fn();
    });

    render(createElement(AuthProvider, null, createElement(SessionProbe)));

    await waitFor(() => expect(screen.getByText("customer-new")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/sync", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer fresh-token" },
    })));
  });

  it("no bloquea la sesión cuando la sincronización falla", async () => {
    const user = {
      uid: "customer-new",
      getIdTokenResult: vi.fn().mockResolvedValue({ token: "fresh-token", claims: {} }),
    };
    fetchMock.mockRejectedValue(new Error("offline"));
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (nextUser: typeof user) => void) => {
      void callback(user);
      return vi.fn();
    });

    render(createElement(AuthProvider, null, createElement(SessionProbe)));

    await waitFor(() => expect(screen.getByText("customer-new")).toBeInTheDocument());
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
  });

  it("fuerza el refresco del token solo una vez por UID ante multiples callbacks de onIdTokenChanged", async () => {
    const user = {
      uid: "admin-owner",
      email: "andres.san1404@gmail.com",
      emailVerified: true,
      getIdTokenResult: vi.fn().mockResolvedValue({ token: "same-token", claims: { admin: true } }),
    };
    let listener: ((nextUser: typeof user) => void) | undefined;
    onIdTokenChanged.mockImplementation((_auth: unknown, callback: (nextUser: typeof user) => void) => {
      listener = callback;
      void callback(user);
      return vi.fn();
    });

    render(createElement(AuthProvider, null, createElement(SessionProbe)));

    await waitFor(() => expect(user.getIdTokenResult).toHaveBeenCalledWith(true));
    listener?.(user);
    await waitFor(() => expect(user.getIdTokenResult).toHaveBeenCalledTimes(2));
    expect(user.getIdTokenResult).toHaveBeenNthCalledWith(1, true);
    expect(user.getIdTokenResult).toHaveBeenNthCalledWith(2, false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
