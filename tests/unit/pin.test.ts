import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isWeakPin, onlyPinDigits, pinChangeErrorMessage, validatePinChange, WRONG_CURRENT_PIN_MESSAGE } from "@/lib/pin";

describe("isWeakPin (mismas reglas que _pin_is_weak en supabase/change_pin.sql)", () => {
  it("son débiles exactamente 24 de los 10.000 PIN: 10 iguales + 7 ascendentes + 7 descendentes", () => {
    const debiles = Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, "0")).filter(isWeakPin);
    expect(debiles).toHaveLength(24);
  });

  it("los obvios son débiles", () => {
    for (const pin of ["0000", "7777", "9999", "1234", "0123", "6789", "4321", "9876", "3210"]) {
      expect(isWeakPin(pin), pin).toBe(true);
    }
  });

  it("los demás no lo son (ni siquiera la vuelta 7890 ni pares repetidos)", () => {
    for (const pin of ["1357", "8520", "2580", "1235", "1122", "1212", "7890", "0001", "4917"]) {
      expect(isWeakPin(pin), pin).toBe(false);
    }
  });
});

describe("las reglas de PIN débil de la pantalla y del servidor no se desfasan", () => {
  it("supabase/change_pin.sql usa las mismas secuencias y el mismo patrón de dígitos iguales", () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../../supabase/change_pin.sql"), "utf8");
    expect(sql).toContain("'0123456789'");
    expect(sql).toContain("'9876543210'");
    expect(sql).toMatch(/\^\(\[0-9\]\)\\1\{3\}\$/); // el patrón ^([0-9])\1{3}$ (cuatro dígitos iguales)
  });
});

describe("onlyPinDigits", () => {
  it("deja solo dígitos y corta en 4", () => {
    expect(onlyPinDigits("12ab34")).toBe("1234");
    expect(onlyPinDigits("123456")).toBe("1234");
    expect(onlyPinDigits("  ")).toBe("");
  });
});

describe("validatePinChange", () => {
  it("acepta un cambio correcto", () => {
    expect(validatePinChange("4917", "8520", "8520")).toBeNull();
  });

  it("avisa el primer problema, en el orden del formulario", () => {
    expect(validatePinChange("", "8520", "8520")).toContain("PIN actual");
    expect(validatePinChange("49", "8520", "8520")).toContain("PIN actual");
    expect(validatePinChange("4917", "85", "85")).toContain("4 dígitos");
    expect(validatePinChange("4917", "4917", "4917")).toContain("distinto del actual");
    expect(validatePinChange("4917", "1234", "1234")).toContain("fácil de adivinar");
    expect(validatePinChange("4917", "8520", "8521")).toContain("no coinciden");
  });
});

describe("pinChangeErrorMessage", () => {
  it("traduce los códigos del servidor", () => {
    expect(pinChangeErrorMessage({ message: "PIN_BLOQUEADO" })).toContain("15 minutos");
    expect(pinChangeErrorMessage({ message: "PIN_DEBIL" })).toContain("fácil de adivinar");
    expect(pinChangeErrorMessage({ message: "PIN_IGUAL" })).toContain("distinto del actual");
  });

  it("cualquier otro error es genérico y no filtra el mensaje técnico", () => {
    const msg = pinChangeErrorMessage({ message: "TypeError: Failed to fetch (db.internal.example)" });
    expect(msg).toContain("No se pudo cambiar el PIN");
    expect(msg).not.toContain("internal");
    expect(pinChangeErrorMessage(null)).toContain("No se pudo cambiar el PIN");
  });

  it("el PIN actual equivocado tiene su propio mensaje (el servidor responde false, no un error)", () => {
    expect(WRONG_CURRENT_PIN_MESSAGE).toBe("El PIN actual no es correcto.");
  });
});
