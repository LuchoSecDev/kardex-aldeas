import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contraste de los colores de texto (WCAG AA: 4,5:1 para texto normal). La app la usan adultas mayores: un gris tenue que
// "se ve bien" en una pantalla nueva puede ser ilegible en la de su equipo. Se leen los colores reales de globals.css.
const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const token = (name: string) => {
  const m = root.match(new RegExp(`--${name}: *(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`No encuentro --${name} en :root de globals.css`);
  return m[1];
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const AA = 4.5;
const WHITE = "#FFFFFF";
const BODY = token("color-bg-body");
// Fondo de las etiquetas grises (.admin-week-chip--pending), el más oscuro donde se usa el texto secundario.
const CHIP = "#ECEEEF";

describe("contraste de los textos (WCAG AA, 4,5:1)", () => {
  it("el cálculo es el de WCAG (blanco contra negro = 21:1; contra sí mismo = 1:1)", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("el texto de cuerpo y el texto secundario se leen sobre blanco, sobre el fondo de la página y sobre las etiquetas grises", () => {
    for (const name of ["color-text-main", "color-text-muted"]) {
      for (const [bgName, bg] of [["blanco", WHITE], ["fondo de la página", BODY], ["etiqueta gris", CHIP]]) {
        expect(contrast(token(name), bg), `${name} sobre ${bgName}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("los colores de marca que llevan texto blanco (botones, barras) o se usan como texto sobre tarjetas blancas cumplen AA", () => {
    for (const name of ["color-primary-dark", "color-accent-red", "color-success", "color-warning"]) {
      expect(contrast(token(name), WHITE), name).toBeGreaterThanOrEqual(AA);
    }
  });
});
