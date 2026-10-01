// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Las dos pantallas pesadas se reemplazan por marcadores: aquí solo interesa
// cómo el selector las monta, las oculta y las conserva.
const mounts = vi.hoisted(() => ({ kardex: 0, lista: 0 }));

vi.mock("@/components/KardexDashboard", async () => {
  const { useEffect } = await import("react");
  function KardexStub() {
    useEffect(() => { mounts.kardex++; }, []);
    return <p>pantalla-kardex</p>;
  }
  return { default: KardexStub };
});
vi.mock("@/components/market/MarketListDashboard", async () => {
  const { useEffect } = await import("react");
  function ListaStub() {
    useEffect(() => { mounts.lista++; }, []);
    return <p>pantalla-lista</p>;
  }
  return { default: ListaStub };
});

import CommunityShell from "@/components/CommunityShell";

afterEach(() => {
  cleanup();
  mounts.kardex = 0;
  mounts.lista = 0;
});

const visible = (text: string) => !screen.getByText(text).closest("[hidden]");

describe("CommunityShell: selector Kardex | Lista de mercado", () => {
  it("empieza en el kardex y la lista ni siquiera se monta (no pide datos hasta que se abre)", () => {
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    expect(visible("pantalla-kardex")).toBe(true);
    expect(screen.queryByText("pantalla-lista")).toBeNull();
    expect(screen.getByRole("tab", { name: "Kardex" }).getAttribute("aria-selected")).toBe("true");
  });

  it("al abrir la lista se muestra y el kardex se OCULTA sin desmontarse", () => {
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lista de mercado" }));
    expect(visible("pantalla-lista")).toBe(true);
    expect(visible("pantalla-kardex")).toBe(false);
    expect(mounts.kardex).toBe(1);
  });

  it("volver y abrir otra vez no vuelve a montar nada (se conserva el estado de cada pantalla)", () => {
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lista de mercado" }));
    fireEvent.click(screen.getByRole("tab", { name: "Kardex" }));
    fireEvent.click(screen.getByRole("tab", { name: "Lista de mercado" }));
    expect(mounts).toEqual({ kardex: 1, lista: 1 });
    expect(visible("pantalla-lista")).toBe(true);
  });

  it("«Cambiar PIN» abre el diálogo desde cualquiera de las dos pantallas y al cerrarlo no se pierde nada", () => {
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Lista de mercado" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar PIN" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mounts).toEqual({ kardex: 1, lista: 1 });
    expect(visible("pantalla-lista")).toBe(true);
  });
});
