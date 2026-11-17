import { describe, expect, it } from "vitest";

import { esClaimAdmin, esEmailAdmin, esTokenAdminVerificado } from "@/lib/auth-claims";

describe("esClaimAdmin", () => {
  it("acepta un claim admin booleano verdadero", () => {
    expect(esClaimAdmin({ admin: true })).toBe(true);
  });

  it("reconoce correos administrativos autorizados aunque no tengan el claim booleano", () => {
    expect(esClaimAdmin({ email: "andres.san1404@gmail.com" })).toBe(true);
    expect(esClaimAdmin({ email: "ANDRES.SAN1404@GMAIL.COM" })).toBe(true);
    expect(esEmailAdmin("andres.san1404@gmail.com")).toBe(true);
  });

  it("rechaza correos no administrativos sin claim", () => {
    expect(esClaimAdmin({ email: "otro@correo.com" })).toBe(false);
    expect(esEmailAdmin("otro@correo.com")).toBe(false);
  });

  it("rechaza un claim admin booleano falso sin email admin", () => {
    expect(esClaimAdmin({ admin: false })).toBe(false);
  });

  it("rechaza un claim admin ausente", () => {
    expect(esClaimAdmin({})).toBe(false);
  });

  it.each(["true", 1, null, undefined, [], {}])("rechaza valores no booleanos: %s", (value) => {
    expect(esClaimAdmin({ admin: value })).toBe(false);
  });
});

describe("esTokenAdminVerificado", () => {
  it("acepta al propietario con correo verificado aunque no tenga claim admin booleano", () => {
    expect(
      esTokenAdminVerificado({
        email: "andres.san1404@gmail.com",
        email_verified: true,
      }),
    ).toBe(true);
    expect(
      esTokenAdminVerificado({
        email: "ANDRES.SAN1404@GMAIL.COM",
        email_verified: true,
      }),
    ).toBe(true);
  });

  it("rechaza al correo propietario si el correo no está verificado y falta el claim admin", () => {
    expect(
      esTokenAdminVerificado({
        email: "andres.san1404@gmail.com",
        email_verified: false,
      }),
    ).toBe(false);
  });

  it("acepta un token con claim admin booleano verdadero", () => {
    expect(esTokenAdminVerificado({ admin: true, email: "otro@correo.com" })).toBe(true);
  });
});
