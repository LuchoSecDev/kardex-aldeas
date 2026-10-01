// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TOASTS, TOAST_DURATION_MS, ToastProvider, useToast, type ToastApi } from "@/components/toast/ToastProvider";
import { useSaveRecoveryToast } from "@/hooks/useSaveRecoveryToast";

// Avisos de confirmación (toasts) para personas mayores: 5 segundos, se cierran TOCÁNDOLOS (sin una X), solo visuales,
// y los errores se quedan hasta que se toquen.
let api!: ToastApi;
function Probe() {
  const toast = useToast();
  useEffect(() => {
    api = toast;
  }, [toast]);
  return null;
}

const renderProvider = () => render(<ToastProvider><Probe /></ToastProvider>);
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const show = (fn: () => void) => act(() => { fn(); });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("toast: cómo se ve y cuánto dura", () => {
  it("un éxito muestra ✓ y el texto, en la zona de avisos educados (role=status)", () => {
    renderProvider();
    show(() => api.success("¡Listo! La lista se envió."));
    const zone = screen.getByRole("status");
    expect(within(zone).getByText("¡Listo! La lista se envió.")).toBeTruthy();
    expect(zone.querySelector(".toast--success")).not.toBeNull();
    expect(zone.querySelector(".toast-icon")?.textContent).toBe("✓");
  });

  it("dura exactamente 5 segundos: sigue a los 4,9 y desaparece a los 5", async () => {
    expect(TOAST_DURATION_MS).toBe(5000);
    renderProvider();
    show(() => api.success("Guardado"));
    await advance(4900);
    expect(screen.queryByText("Guardado")).not.toBeNull();
    await advance(100);
    expect(screen.queryByText("Guardado")).toBeNull();
  });

  it("un aviso (warning) también dura 5 segundos y usa ⚠", async () => {
    renderProvider();
    show(() => api.warning("Revisa las salidas"));
    expect(screen.getByRole("status").querySelector(".toast--warning .toast-icon")?.textContent).toBe("⚠");
    await advance(5000);
    expect(screen.queryByText("Revisa las salidas")).toBeNull();
  });

  it("un error NO se va solo: sigue después de un minuto, y sale en la zona de alertas (role=alert)", async () => {
    renderProvider();
    show(() => api.error("No se pudo enviar la lista"));
    await advance(60_000);
    const zone = screen.getByRole("alert");
    expect(within(zone).getByText("No se pudo enviar la lista")).toBeTruthy();
    expect(zone.querySelector(".toast--error")).not.toBeNull();
  });

  it("las dos zonas de lectura de pantalla existen desde el principio, vacías (para que anuncien lo que llegue)", () => {
    renderProvider();
    expect(screen.getByRole("status").children).toHaveLength(0);
    expect(screen.getByRole("alert").children).toHaveLength(0);
  });
});

describe("toast: se cierra tocándolo", () => {
  it("tocar un éxito lo cierra al instante, sin esperar los 5 segundos", () => {
    renderProvider();
    show(() => api.success("Excel descargado"));
    fireEvent.click(screen.getByRole("button", { name: /Excel descargado/ }));
    expect(screen.queryByText("Excel descargado")).toBeNull();
  });

  it("tocar un error lo cierra", () => {
    renderProvider();
    show(() => api.error("Falló"));
    fireEvent.click(screen.getByRole("button", { name: /Falló/ }));
    expect(screen.queryByText("Falló")).toBeNull();
  });

  it("no hay una «X» ni un botón «Cerrar» aparte: el único botón es el propio aviso, con la pista «Toca para cerrar»", () => {
    renderProvider();
    show(() => api.success("Listo"));
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain("Toca para cerrar");
    expect(screen.queryByRole("button", { name: /^(×|x|cerrar)$/i })).toBeNull();
    expect(buttons[0].tagName).toBe("BUTTON"); // se activa también con teclado (Enter / espacio)
  });

  it("tocar uno no cierra los demás", () => {
    renderProvider();
    show(() => { api.success("Uno"); api.success("Dos"); });
    fireEvent.click(screen.getByRole("button", { name: /Uno/ }));
    expect(screen.queryByText("Uno")).toBeNull();
    expect(screen.queryByText("Dos")).not.toBeNull();
  });
});

describe("toast: varios a la vez", () => {
  it("el mismo aviso repetido no se apila: se reemplaza y vuelve a contar los 5 segundos", async () => {
    renderProvider();
    show(() => api.success("Excel descargado"));
    await advance(3000);
    show(() => api.success("Excel descargado"));
    expect(screen.getAllByText("Excel descargado")).toHaveLength(1);
    await advance(3000); // pasaron 6 s desde el primero, pero solo 3 desde el segundo
    expect(screen.queryByText("Excel descargado")).not.toBeNull();
    await advance(2000);
    expect(screen.queryByText("Excel descargado")).toBeNull();
  });

  it("como máximo se ven 3: al llegar uno más desaparece el más viejo", () => {
    expect(MAX_TOASTS).toBe(3);
    renderProvider();
    show(() => { api.success("A"); api.success("B"); api.success("C"); api.success("D"); });
    expect(screen.queryByText("A")).toBeNull();
    for (const t of ["B", "C", "D"]) expect(screen.queryByText(t)).not.toBeNull();
  });

  it("un éxito y un error iguales en texto son avisos distintos", () => {
    renderProvider();
    show(() => { api.success("Listo"); api.error("Listo"); });
    expect(screen.getAllByText("Listo")).toHaveLength(2);
  });
});

describe("toast: integración", () => {
  it("sin proveedor, usar useToast no rompe nada (las pantallas se prueban solas)", () => {
    let called = false;
    function Alone() {
      const toast = useToast();
      useEffect(() => {
        toast.success("x"); toast.warning("y"); toast.error("z");
        called = true;
      }, [toast]);
      return <p>pantalla</p>;
    }
    render(<Alone />);
    expect(called).toBe(true);
    expect(screen.getByText("pantalla")).toBeTruthy();
  });

  it("la API es estable entre renders (si no, los efectos que la usan se repetirían sin fin)", () => {
    const seen = new Set<ToastApi>();
    function Spy() {
      seen.add(useToast());
      return null;
    }
    const { rerender } = render(<ToastProvider><Spy /></ToastProvider>);
    show(() => api?.success?.("x"));
    rerender(<ToastProvider><Spy /></ToastProvider>);
    expect(seen.size).toBe(1);
  });

  it("los avisos siguen la letra A+/A++: usan em (el tamaño lo fija el body, así que rem NO cambiaría) y no píxeles fijos", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf(".toast {"), css.indexOf(".toast--success"));
    expect(block).toMatch(/font-size:\s*1\.15em/);
    expect(block).not.toMatch(/font-size:\s*[\d.]+(px|rem)/);
    expect(block).not.toMatch(/(padding|min-height|gap):[^;]*rem/);
    expect(css).toMatch(/\.high-contrast \.toast\s*\{[^}]*border:\s*4px solid #fff/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.toast\s*\{\s*animation:\s*none/);
  });
});

describe("useSaveRecoveryToast", () => {
  type Status = "idle" | "saving" | "saved" | "error";
  function Harness({ status }: { status: Status }) {
    useSaveRecoveryToast(status);
    return null;
  }
  const renderWith = (status: Status) =>
    render(<ToastProvider><Harness status={status} /></ToastProvider>);

  it("avisa solo cuando un guardado que había fallado por fin se logra", () => {
    const { rerender } = renderWith("saving");
    const set = (s: Status) => rerender(<ToastProvider><Harness status={s} /></ToastProvider>);
    set("error");
    expect(screen.queryByText("Listo: tus cambios se guardaron.")).toBeNull();
    set("saving");
    set("saved");
    expect(screen.queryByText("Listo: tus cambios se guardaron.")).not.toBeNull();
  });

  it("guardar normalmente (sin falla previa) NO da toast: eso lo muestra el indicador fijo", () => {
    const { rerender } = renderWith("idle");
    for (const s of ["saving", "saved", "saving", "saved"] as Status[]) rerender(<ToastProvider><Harness status={s} /></ToastProvider>);
    expect(screen.queryByText(/se guardaron/)).toBeNull();
  });
});
