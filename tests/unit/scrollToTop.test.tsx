// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScrollToTop, { SCROLL_TOP_THRESHOLD_PX } from "@/components/ScrollToTop";

// Botón «volver arriba»: aparece al alejarse del inicio y lleva arriba de un toque (las colaboradoras no tienen que
// deslizar toda la página después de anotar el último producto).
const scrollTo = vi.fn();

function scrollPage(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => {
    fireEvent.scroll(window);
  });
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  scrollTo.mockReset();
});

const button = () => screen.queryByRole("button", { name: "Volver arriba" });

describe("ScrollToTop", () => {
  it("no se ve al inicio de la página", () => {
    render(<ScrollToTop />);
    expect(button()).toBeNull();
  });

  it("aparece al bajar más del umbral y desaparece al volver a subir", () => {
    render(<ScrollToTop />);
    scrollPage(SCROLL_TOP_THRESHOLD_PX); // justo en el umbral: aún no
    expect(button()).toBeNull();
    scrollPage(SCROLL_TOP_THRESHOLD_PX + 1);
    expect(button()).not.toBeNull();
    scrollPage(10);
    expect(button()).toBeNull();
  });

  it("al tocarlo sube al principio con movimiento suave", () => {
    render(<ScrollToTop />);
    scrollPage(2000);
    fireEvent.click(button()!);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("con «reducir movimiento» sube de golpe, sin animación", () => {
    setReducedMotion(true);
    render(<ScrollToTop />);
    scrollPage(2000);
    fireEvent.click(button()!);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("al desmontarse deja de escuchar el scroll", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ScrollToTop />);
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });
});

describe("ScrollToTop en la aplicación", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("está montado en el layout, para que sirva en todas las pantallas", () => {
    expect(read("src/app/layout.tsx")).toMatch(/<ScrollToTop\s*\/>/);
  });

  it("queda debajo de los modales y de los avisos, y crece con el tamaño de letra", () => {
    const css = read("src/app/globals.css");
    const block = css.match(/\.scroll-top-btn\s*\{[^}]*\}/)![0];
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/right:/);
    expect(block).toMatch(/bottom:/);
    expect(Number(block.match(/z-index:\s*(\d+)/)![1])).toBeLessThan(1000);
    expect(block).toMatch(/width:\s*[\d.]+em/);
  });
});
