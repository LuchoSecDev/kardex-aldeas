// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomSelect from "@/components/CustomSelect";

// El desplegable de toda la app (reemplaza al <select> del navegador, que se abre enorme y sin estilo): ratón, teclado
// y escribir para saltar, como la lista nativa. Se prueba con una lista de varios productos con tildes.
const OPTIONS = [
  { value: "", label: "Sin producto (nota general)" },
  { value: "a1", label: "ACELGA" },
  { value: "a2", label: "ÁRBOL DE PAN" },
  { value: "b1", label: "BANANO CRIOLLO" },
  { value: "b2", label: "BANANO URABA" },
  { value: "p1", label: "PAPA PASTUSA" },
];

function Harness({ onChange = vi.fn(), disabled = false, initial = "" }: { onChange?: (v: string) => void; disabled?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="producto">Producto (opcional)</label>
      <CustomSelect id="producto" options={OPTIONS} value={value} disabled={disabled} onChange={(v) => { setValue(v); onChange(v); }} />
      <button type="button">Fuera</button>
    </>
  );
}

const trigger = () => screen.getByLabelText("Producto (opcional)");
const menu = () => screen.getByRole("listbox");
const activeOption = () => document.getElementById(menu().getAttribute("aria-activedescendant")!)!.textContent;
const key = (k: string) => fireEvent.keyDown(menu(), { key: k });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CustomSelect: ratón y etiqueta", () => {
  it("el botón se enlaza con su etiqueta, empieza cerrado y muestra la opción elegida", () => {
    render(<Harness />);
    expect(trigger().textContent).toContain("Sin producto (nota general)");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("al tocarlo se abre con todas las opciones; al tocar una, elige, se cierra y devuelve el foco al botón", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    expect(screen.getAllByRole("option")).toHaveLength(OPTIONS.length);
    fireEvent.click(screen.getByRole("option", { name: "PAPA PASTUSA" }));
    expect(onChange).toHaveBeenCalledWith("p1");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().textContent).toContain("PAPA PASTUSA");
    expect(document.activeElement).toBe(trigger());
  });

  it("tocar fuera lo cierra sin cambiar nada", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByRole("button", { name: "Fuera" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("deshabilitado: el botón no se puede usar y no abre la lista", () => {
    render(<Harness disabled />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("al abrir, la opción elegida queda como activa y marcada", () => {
    render(<Harness initial="b2" />);
    fireEvent.click(trigger());
    expect(activeOption()).toBe("BANANO URABA");
    expect(screen.getByRole("option", { name: "BANANO URABA" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("CustomSelect: teclado", () => {
  it("flecha abajo en el botón abre la lista, con el foco dentro", () => {
    render(<Harness />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(menu()).toBeTruthy();
    expect(document.activeElement).toBe(menu());
    expect(activeOption()).toBe("Sin producto (nota general)");
  });

  it("las flechas mueven la opción activa y Enter la elige", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    key("ArrowDown");
    key("ArrowDown");
    expect(activeOption()).toBe("ÁRBOL DE PAN");
    key("ArrowUp");
    expect(activeOption()).toBe("ACELGA");
    key("Enter");
    expect(onChange).toHaveBeenCalledWith("a1");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("no se sale de la lista: arriba del primero y abajo del último se queda; Inicio y Fin saltan a los extremos", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    key("ArrowUp");
    expect(activeOption()).toBe("Sin producto (nota general)");
    key("End");
    expect(activeOption()).toBe("PAPA PASTUSA");
    key("ArrowDown");
    expect(activeOption()).toBe("PAPA PASTUSA");
    key("Home");
    expect(activeOption()).toBe("Sin producto (nota general)");
  });

  it("la barra espaciadora también elige", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    key("End");
    key(" ");
    expect(onChange).toHaveBeenCalledWith("p1");
  });

  it("Escape cierra sin cambiar y devuelve el foco al botón", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    key("ArrowDown");
    key("Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger());
  });

  it("Tab cierra la lista", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    key("Tab");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("CustomSelect: escribir para saltar", () => {
  const type = (letters: string) => letters.split("").forEach((l) => key(l));

  it("una letra salta a la primera opción que empieza con ella, sin distinguir tildes ni mayúsculas", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    type("b");
    expect(activeOption()).toBe("BANANO CRIOLLO");
    vi.advanceTimersByTime(1000);
    type("a");
    expect(activeOption()).toBe("ACELGA"); // la «a» sola es ACELGA, no ÁRBOL: gana la primera de la lista
  });

  it("varias letras seguidas afinan la búsqueda, y el espacio a mitad de la búsqueda es parte del texto (no elige)", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    type("banano u");
    expect(activeOption()).toBe("BANANO URABA");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("las tildes no estorban: «ar» encuentra ÁRBOL DE PAN", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    type("ar");
    expect(activeOption()).toBe("ÁRBOL DE PAN");
  });

  it("tras una pausa el texto escrito se olvida y empieza de nuevo", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    type("b");
    vi.advanceTimersByTime(1000);
    type("p");
    expect(activeOption()).toBe("PAPA PASTUSA"); // sin la pausa habría buscado «bp»
  });

  it("una letra sin coincidencias deja la opción activa donde estaba", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    key("ArrowDown");
    type("z");
    expect(activeOption()).toBe("ACELGA");
  });
});
