// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "@/components/ConfirmDialog";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import ConflictDialog from "@/components/ConflictDialog";

afterEach(cleanup);

describe("ConfirmDialog (confirmación con el estilo de la app)", () => {
  const setup = (props: { danger?: boolean } = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="¿Enviar?" confirmLabel="Sí, enviar" danger={props.danger} onConfirm={onConfirm} onCancel={onCancel}>
        <p>Detalle de la acción.</p>
      </ConfirmDialog>
    );
    return { onConfirm, onCancel };
  };

  it("es un diálogo con título y descripción accesibles, y dos botones", () => {
    setup();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "¿Enviar?" })).toBeTruthy();
    expect(dialog.textContent).toContain("Detalle de la acción.");
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sí, enviar" })).toBeTruthy();
  });

  it("confirmar y cancelar llaman a su función", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Esc cancela; tocar fuera del cuadro NO hace nada", () => {
    const { onConfirm, onCancel } = setup();
    const overlay = screen.getByRole("alertdialog").parentElement as HTMLElement;
    fireEvent.click(overlay);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("el foco empieza en confirmar, o en Cancelar cuando la acción pierde algo (danger)", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sí, enviar" }));
    cleanup();
    setup({ danger: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Sí, enviar" }).className).toContain("btn-danger");
  });

  it("Tab da la vuelta entre los dos botones sin salirse del diálogo", () => {
    setup();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Sí, enviar" });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("al cerrarse devuelve el foco al botón que lo abrió", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Abrir</button>
          {open && (
            <ConfirmDialog title="¿Seguro?" confirmLabel="Sí" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("UnsavedChangesDialog (salir con cambios sin guardar)", () => {
  it("avisa que se perderán, empieza en «Seguir aquí» y sale solo con «Salir de todos modos»", () => {
    const onLeave = vi.fn();
    const onStay = vi.fn();
    render(<UnsavedChangesDialog onLeave={onLeave} onStay={onStay} />);
    expect(screen.getByRole("alertdialog").textContent).toContain("se perderán");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Seguir aquí" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir aquí" }));
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salir de todos modos" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe("aviso de un solo botón (cancelLabel={null}) y ConflictDialog", () => {
  it("sin botón de cancelar: Esc y «Entendido» hacen lo mismo y Tab no se sale", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Aviso" confirmLabel="Entendido" cancelLabel={null} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const ok = screen.getByRole("button", { name: "Entendido" });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ConflictDialog nombra uno, dos o varios productos y explica que el cambio no se guardó", () => {
    const onClose = vi.fn();
    const text = (names: string[]) => {
      cleanup();
      render(<ConflictDialog productNames={names} onClose={onClose} />);
      return screen.getByRole("alertdialog").textContent ?? "";
    };
    expect(text(["Arroz"])).toContain("cambió Arroz.");
    expect(text(["Arroz", "Leche"])).toContain("cambió Arroz y Leche.");
    expect(text(["Arroz", "Leche", "Pan"])).toContain("cambió Arroz, Leche y Pan.");
    expect(text(["Arroz"])).toContain("no se guardó");
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Las ventanas del navegador (confirm, alert, prompt) salen con otro diseño y letra pequeña: toda confirmación va por ConfirmDialog.
describe("la app no usa las ventanas nativas del navegador", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/[.](ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  };

  it("ningún archivo de src llama a confirm(), alert() ni prompt()", () => {
    const files = walk("src");
    expect(files.length).toBeGreaterThan(50);
    const found = files.filter((f) => /(^|[^A-Za-z_.])(window[.])?(confirm|alert|prompt)[(]/m.test(readFileSync(f, "utf8")));
    expect(found, "usa ConfirmDialog en lugar de las ventanas del navegador").toEqual([]);
  });
});
