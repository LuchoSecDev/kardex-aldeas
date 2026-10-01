import { describe, expect, it } from "vitest";
import { provision, supabase, uniqueName } from "./helpers";

// Plan 005: las 8 comunidades son fijas y nadie puede crear otras desde internet.
// Necesita haber corrido fixed_communities.sql y lock_down_community_creation_1..2.sql.
const FIJAS = ["Casa Blanca", "Esmeralda", "Fortaleza", "Leones", "Maná", "Primavera", "Renacer", "Shalom"];

describe("Comunidades fijas y creación cerrada", () => {
  it("las 8 comunidades existen y todas tienen PIN", async () => {
    const { data, error } = await supabase.from("communities").select("name,has_pin").in("name", FIJAS);
    expect(error).toBeNull();
    expect((data ?? []).map((c) => c.name).sort()).toEqual([...FIJAS].sort());
    expect((data ?? []).filter((c) => !c.has_pin)).toEqual([]);
  });

  it("create_community_with_pin ya no se puede llamar desde internet", async () => {
    const { data, error } = await supabase.rpc("create_community_with_pin", { p_name: uniqueName("cerrada"), p_pin: "1234" });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("claim_pin_for_existing_community ya no se puede llamar desde internet", async () => {
    const { error } = await supabase.rpc("claim_pin_for_existing_community", { p_name: "Maná", p_pin: "1234" });
    expect(error).not.toBeNull();
  });

  it("anon no inserta ni actualiza comunidades directo en la tabla", async () => {
    const insert = await supabase.from("communities").insert({ name: uniqueName("directo") });
    expect(insert.error).not.toBeNull();
  });

  it("provision_community rechaza una clave equivocada", async () => {
    const { data, error } = await provision(uniqueName("malaclave"), "1234", "clave-que-no-es");
    expect(data).toBeNull();
    expect(error?.message).toContain("CLAVE_INVALIDA");
  });

  it("la clave de aprovisionamiento no se puede leer", async () => {
    const { error } = await supabase.from("community_provision_key").select("*");
    expect(error).not.toBeNull();
  });
});
