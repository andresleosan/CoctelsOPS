import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermissionMock,
  isGlobalAdminMock,
  listUsersMock,
  addAdministratorByEmailMock,
  setUserAdminStatusMock,
  updateUserMock,
  getUserProfileMock,
} = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  isGlobalAdminMock: vi.fn(),
  listUsersMock: vi.fn(),
  addAdministratorByEmailMock: vi.fn(),
  setUserAdminStatusMock: vi.fn(),
  updateUserMock: vi.fn(),
  getUserProfileMock: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: requirePermissionMock,
  isGlobalAdmin: isGlobalAdminMock,
}));

vi.mock("@/lib/firestore/users", () => {
  class AdminUserValidationError extends Error {
    readonly status = 422;
  }
  class UserNotFoundError extends Error {
    readonly status = 404;
  }
  return {
    AdminUserValidationError,
    UserNotFoundError,
    listUsers: listUsersMock,
    addAdministratorByEmail: addAdministratorByEmailMock,
    setUserAdminStatus: setUserAdminStatusMock,
    updateUser: updateUserMock,
    getUserProfile: getUserProfileMock,
  };
});

import { AuthorizationError } from "@/lib/auth/verify-request";
import { GET, POST } from "@/app/api/admin/users/route";
import { PATCH } from "@/app/api/admin/users/[uid]/route";

const adminCaller = {
  uid: "admin-1",
  permissions: [],
  profile: { uid: "admin-1", accountType: "admin", active: true },
};

const staffCaller = {
  uid: "staff-1",
  permissions: ["usuarios.manage"],
  profile: { uid: "staff-1", accountType: "staff", active: true },
};

describe("/api/admin/users & [uid]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue(adminCaller);
    isGlobalAdminMock.mockReturnValue(true);
  });

  it("lista usuarios en GET", async () => {
    listUsersMock.mockResolvedValueOnce([{ uid: "u1", email: "a@a.com", accountType: "admin" }]);
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users).toHaveLength(1);
  });

  it("permite a un admin agregar otro administrador por correo en POST", async () => {
    addAdministratorByEmailMock.mockResolvedValueOnce({
      user: {
        uid: "new-admin",
        email: "socio@coctelsops.com",
        accountType: "admin",
        roleIds: ["admin"],
        active: true,
      },
      createdAuthUser: true,
    });

    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "socio@coctelsops.com",
        displayName: "Laura Socio",
        password: "Password123!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(addAdministratorByEmailMock).toHaveBeenCalledWith(
      { email: "socio@coctelsops.com", displayName: "Laura Socio", password: "Password123!" },
      "admin-1",
    );
  });

  it("rechaza con 403 si un usuario no admin intenta agregar un administrador", async () => {
    requirePermissionMock.mockResolvedValueOnce(staffCaller);
    isGlobalAdminMock.mockReturnValueOnce(false);

    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "otro@coctelsops.com" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(addAdministratorByEmailMock).not.toHaveBeenCalled();
  });

  it("rechaza con 422 correos inválidos en POST", async () => {
    const req = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "correo-invalido" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(addAdministratorByEmailMock).not.toHaveBeenCalled();
  });

  it("promueve y revoca administradores en PATCH y propaga conflictos 409", async () => {
    setUserAdminStatusMock.mockResolvedValueOnce({});
    getUserProfileMock.mockResolvedValueOnce({
      uid: "u2",
      email: "u2@coctelsops.com",
      accountType: "admin",
      roleIds: ["admin"],
      active: true,
    });

    const promoteReq = new Request("http://localhost/api/admin/users/u2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountType: "admin" }),
    });

    const resOk = await PATCH(promoteReq, { params: Promise.resolve({ uid: "u2" }) });
    expect(resOk.status).toBe(200);
    expect(setUserAdminStatusMock).toHaveBeenCalledWith("u2", true, "admin-1", "staff");

    setUserAdminStatusMock.mockRejectedValueOnce(
      new AuthorizationError(409, "Debe permanecer al menos un administrador activo en el sistema"),
    );

    const demoteReq = new Request("http://localhost/api/admin/users/u2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountType: "staff" }),
    });
    const res409 = await PATCH(demoteReq, { params: Promise.resolve({ uid: "u2" }) });
    expect(res409.status).toBe(409);
  });
});
