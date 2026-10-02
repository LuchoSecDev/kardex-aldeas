// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Las dos pantallas pesadas se reemplazan por marcadores: aquí solo interesa
// cómo el selector las monta, las oculta y las conserva.
const mounts = vi.hoisted(() => ({ kardex: 0, lista: 0 }));
// Respuestas sin leer que «trae» la campanita (la consulta real se reemplaza).
const bell = vi.hoisted(() => ({ replies: [] as unknown[] }));

vi.mock("@/hooks/useMarketReplies", () => ({ useMarketReplies: () => ({ replies: bell.replies }), REPLIES_CHANGED_EVENT: "x" }));

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
  function ListaStub({ focus }: { focus?: unknown }) {
    useEffect(() => { mounts.lista++; }, []);
    return <><p>pantalla-lista</p><span data-testid="focus">{JSON.stringify(focus ?? null)}</span></>;
  }
  return { default: ListaStub };
});

import CommunityShell from "@/components/CommunityShell";

afterEach(() => {
  cleanup();
  document.getElementById("a11y-bar-slot")?.remove();
  bell.replies = [];
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

describe("CommunityShell: campanita de respuestas de la nutricionista", () => {
  const RESPUESTA = {
    week_start: "2026-10-12", kind: "carnes", change_id: "c1", change_text: "Pescado por pechuga", item_name: "PESCADO FILETE",
    reply_text: "Se envía pechuga", replied_at: "2026-10-01T15:00:00Z",
  };
  const withSlot = () => {
    const slot = document.createElement("div");
    slot.id = "a11y-bar-slot";
    document.body.appendChild(slot);
    return slot;
  };

  it("la campanita sale en la barra azul de arriba (el hueco de la barra), no dentro de la pantalla", () => {
    const slot = withSlot();
    bell.replies = [RESPUESTA];
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    expect(slot.querySelector(".reply-bell")).not.toBeNull();
    expect(slot.textContent).toContain("1");
  });

  it("sin el hueco de la barra (p. ej. en una prueba) no se muestra y nada se rompe", () => {
    bell.replies = [RESPUESTA];
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    expect(document.querySelector(".reply-bell")).toBeNull();
    expect(screen.getByText("pantalla-kardex")).toBeTruthy();
  });

  it("tocar «Ver en la lista» abre la lista de mercado y le pide esa semana y ese tipo", () => {
    withSlot();
    bell.replies = [RESPUESTA];
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    expect(screen.queryByText("pantalla-lista")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista: 1 nueva/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ver en la lista" }));

    expect(screen.getByRole("tab", { name: "Lista de mercado" }).getAttribute("aria-selected")).toBe("true");
    expect(JSON.parse(screen.getByTestId("focus").textContent!)).toEqual({ weekStart: "2026-10-12", kind: "carnes", nonce: 1 });
  });

  it("tocar otra respuesta después sube el `nonce` (así la lista vuelve a reaccionar aunque sea la misma semana)", () => {
    withSlot();
    bell.replies = [RESPUESTA];
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Respuestas de la nutricionista/ }));
      fireEvent.click(screen.getByRole("button", { name: "Ver en la lista" }));
    }
    expect(JSON.parse(screen.getByTestId("focus").textContent!).nonce).toBe(2);
    expect(mounts.lista).toBe(1); // la pantalla se monta una sola vez
  });

  it("estando en la lista sin respuestas tocadas, no pide ninguna semana", () => {
    render(<CommunityShell community="Maná" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lista de mercado" }));
    expect(screen.getByTestId("focus").textContent).toBe("null");
  });
});
