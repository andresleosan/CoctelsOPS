import { describe, expect, it } from "vitest";

import { esClaimAdmin, esEmailAdmin } from "@/lib/auth-claims";

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
