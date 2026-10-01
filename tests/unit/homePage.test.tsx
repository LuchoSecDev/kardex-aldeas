// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plan 005: las comunidades son fijas. La pantalla de entrada solo deja ELEGIR una de la lista
// (no escribir un nombre nuevo ni crear PIN) y no entra a una comunidad sin PIN.
const service = vi.hoisted(() => ({
  loadCommunities: vi.fn(),
  loginCommunity: vi.fn(),
  logoutCommunity: vi.fn(),
}));

vi.mock("@/lib/kardexService", () => ({ kardexService: service }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/CommunityShell", () => ({
  default: ({ community }: { community: string }) => <p>kardex-de-{community}</p>,
}));

import Home from "@/app/page";
import { session } from "@/lib/session";

const COMUNIDADES = [
  { name: "Casa Blanca", has_pin: true },
  { name: "Maná", has_pin: true },
  { name: "Nueva", has_pin: false },
];

beforeEach(() => {
  service.loadCommunities.mockResolvedValue({ data: COMUNIDADES, error: null });
  service.loginCommunity.mockResolvedValue({ data: "token-123", error: null });
  service.logoutCommunity.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  session.set(null);
});

async function elegir(nombre: string) {
  const trigger = await screen.findByRole("button", { name: /Elija su comunidad/ });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("option", { name: nombre }));
}

const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

describe("Pantalla de entrada: comunidades fijas", () => {
  it("solo se puede elegir de la lista: no hay campo de texto ni opción de crear comunidad", async () => {
    render(<Home />);
    await screen.findByRole("button", { name: /Elija su comunidad/ });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/crear/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Elija su comunidad/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Casa Blanca", "Maná", "Nueva"]);
  });

  it("«Continuar» está deshabilitado hasta elegir una comunidad", async () => {
    render(<Home />);
    await screen.findByRole("button", { name: /Elija su comunidad/ });
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("elige una comunidad, pide SOLO el PIN (sin confirmación) y entra con el token", async () => {
    render(<Home />);
    await elegir("Maná");
    continuar();

    expect(await screen.findByText("Ingresa el PIN")).toBeTruthy();
    expect(screen.queryByLabelText("Confirma el PIN")).toBeNull();
    expect(screen.queryByText(/Omitir/)).toBeNull();

    fireEvent.change(screen.getByLabelText("PIN (4 dígitos)"), { target: { value: "4321" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("kardex-de-Maná")).toBeTruthy();
    expect(service.loginCommunity).toHaveBeenCalledWith("Maná", "4321");
    expect(session.get()).toBe("token-123");
  });

  it("un PIN incorrecto avisa y no entra", async () => {
    service.loginCommunity.mockResolvedValue({ data: null, error: null });
    render(<Home />);
    await elegir("Casa Blanca");
    continuar();
    fireEvent.change(await screen.findByLabelText("PIN (4 dígitos)"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("PIN incorrecto.");
    expect(screen.queryByText(/kardex-de-/)).toBeNull();
    expect(session.get()).toBeNull();
  });

  it("un PIN de menos de 4 dígitos ni siquiera llama al servidor", async () => {
    render(<Home />);
    await elegir("Maná");
    continuar();
    fireEvent.change(await screen.findByLabelText("PIN (4 dígitos)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("El PIN debe tener 4 dígitos.");
    expect(service.loginCommunity).not.toHaveBeenCalled();
  });

  it("tras 5 fallos el servidor bloquea y se avisa que espere 15 minutos", async () => {
    service.loginCommunity.mockResolvedValue({ data: null, error: { message: "PIN_BLOQUEADO" } });
    render(<Home />);
    await elegir("Maná");
    continuar();
    fireEvent.change(await screen.findByLabelText("PIN (4 dígitos)"), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Espera 15 minutos");
  });

  it("una comunidad sin PIN no entra: avisa que la administradora debe asignárselo y no llama a login", async () => {
    render(<Home />);
    await elegir("Nueva");
    continuar();

    expect((await screen.findByRole("alert")).textContent).toContain("todavía no tiene PIN");
    expect(screen.queryByText("Ingresa el PIN")).toBeNull();
    expect(service.loginCommunity).not.toHaveBeenCalled();
  });

  it("«Cambiar de comunidad» vuelve a la lista", async () => {
    render(<Home />);
    await elegir("Maná");
    continuar();
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar de comunidad" }));

    expect(await screen.findByRole("button", { name: /Elija su comunidad/ })).toBeTruthy();
  });

  it("si no carga la lista de comunidades, avisa y permite reintentar", async () => {
    service.loadCommunities.mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Home />);

    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cargar la lista de comunidades");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Elija su comunidad/ })).toBeTruthy());
    expect(service.loadCommunities).toHaveBeenCalledTimes(2);
  });
});
