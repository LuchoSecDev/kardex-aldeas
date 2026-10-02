// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NumberWheelGuard from "@/components/NumberWheelGuard";

// Girar la rueda sobre una casilla numérica escrita cambiaba el número sin querer (3 pasaba a 3,5). La protección la
// «suelta» antes de que el navegador la cambie. (El cambio de valor en sí lo hace el navegador y jsdom no lo imita:
// aquí se comprueba que la casilla deja de estar enfocada, que es lo que lo evita; el efecto real se verificó con la
// rueda de un navegador de verdad.)
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const wheel = (el: Element) => fireEvent.wheel(el, { deltaY: -100 });

describe("NumberWheelGuard", () => {
  it("una casilla numérica enfocada se suelta al girar la rueda encima, y conserva lo escrito", () => {
    const { getByLabelText } = render(<><NumberWheelGuard /><input aria-label="entrada" type="number" step="0.5" /></>);
    const input = getByLabelText("entrada") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "3" } });
    expect(document.activeElement).toBe(input);

    wheel(input);
    expect(document.activeElement).not.toBe(input);
    expect(input.value).toBe("3");
  });

  it("después de soltarla, la rueda ya no la toca (la página puede hacer scroll normal)", () => {
    const { getByLabelText } = render(<><NumberWheelGuard /><input aria-label="entrada" type="number" /></>);
    const input = getByLabelText("entrada") as HTMLInputElement;
    input.focus();
    wheel(input);
    const eventos: boolean[] = [];
    input.addEventListener("wheel", (e) => eventos.push(e.defaultPrevented));
    wheel(input);
    expect(eventos).toEqual([false]); // la protección nunca bloquea el scroll de la página
  });

  it("una casilla numérica SIN foco no se toca: el foco sigue donde estaba", () => {
    const { getByLabelText } = render(
      <><NumberWheelGuard /><input aria-label="otra" type="text" /><input aria-label="entrada" type="number" /></>
    );
    const otra = getByLabelText("otra") as HTMLInputElement;
    otra.focus();
    wheel(getByLabelText("entrada"));
    expect(document.activeElement).toBe(otra);
  });

  it("los campos de texto (el buscador, el motivo) NO se sueltan al girar la rueda", () => {
    const { getByLabelText } = render(<><NumberWheelGuard /><input aria-label="buscar" type="search" /><input aria-label="motivo" type="text" /></>);
    for (const label of ["buscar", "motivo"]) {
      const el = getByLabelText(label) as HTMLInputElement;
      el.focus();
      wheel(el);
      expect(document.activeElement, label).toBe(el);
    }
  });

  it("protege cualquier casilla numérica de la página, también las que se agregan después (por ejemplo un diálogo)", () => {
    const { container } = render(<NumberWheelGuard />);
    const nueva = document.createElement("input");
    nueva.type = "number";
    container.appendChild(nueva);
    nueva.focus();
    wheel(nueva);
    expect(document.activeElement).not.toBe(nueva);
  });

  it("al desmontarse quita su oyente (no queda nada escuchando)", () => {
    const quitar = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<NumberWheelGuard />);
    unmount();
    expect(quitar).toHaveBeenCalledWith("wheel", expect.any(Function), expect.objectContaining({ capture: true }));
  });

  it("escucha en fase de captura y en modo pasivo: corre antes que la acción del navegador y no frena el scroll", () => {
    const agregar = vi.spyOn(document, "addEventListener");
    render(<NumberWheelGuard />);
    expect(agregar).toHaveBeenCalledWith("wheel", expect.any(Function), { capture: true, passive: true });
  });

  it("está montada en el diseño general, así que cubre TODAS las pantallas (kardex, corrección de saldo, panel)", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('import NumberWheelGuard from "@/components/NumberWheelGuard"');
    expect(layout).toContain("<NumberWheelGuard />");
  });
});
