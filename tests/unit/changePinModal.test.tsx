// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plan 006: la comunidad cambia su propio PIN. El servicio se simula; lo que importa es cuándo se llama
// y qué se le dice a la persona en cada caso.
const service = vi.hoisted(() => ({ changePin: vi.fn() }));
vi.mock("@/lib/kardexService", () => ({ kardexService: service }));

import ChangePinModal from "@/components/ChangePinModal";

beforeEach(() => {
  service.changePin.mockResolvedValue({ data: true, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const llenar = (actual: string, nuevo: string, confirmacion: string) => {
  fireEvent.change(screen.getByLabelText("PIN actual"), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText("PIN nuevo"), { target: { value: nuevo } });
  fireEvent.change(screen.getByLabelText("Confirma el PIN nuevo"), { target: { value: confirmacion } });
};
const enviar = () => fireEvent.click(screen.getByRole("button", { name: "Cambiar PIN" }));

describe("ChangePinModal", () => {
  it("es un diálogo con tres campos de PIN y solo acepta dígitos (máximo 4)", () => {
    render(<ChangePinModal onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    llenar("49ab17x9", "8-5-2-0", "85201");
    expect((screen.getByLabelText("PIN actual") as HTMLInputElement).value).toBe("4917");
    expect((screen.getByLabelText("PIN nuevo") as HTMLInputElement).value).toBe("8520");
    expect((screen.getByLabelText("Confirma el PIN nuevo") as HTMLInputElement).value).toBe("8520");
  });

  it("con datos válidos llama al servicio con (actual, nuevo) y muestra la confirmación", async () => {
    render(<ChangePinModal onClose={vi.fn()} />);
    llenar("4917", "8520", "8520");
    enviar();

    expect((await screen.findByRole("status")).textContent).toContain("Tu PIN se cambió");
    expect(service.changePin).toHaveBeenCalledTimes(1);
    expect(service.changePin).toHaveBeenCalledWith("4917", "8520");
    expect(screen.queryByLabelText("PIN actual")).toBeNull();
  });

  it("los errores de formato se avisan sin llamar al servidor", () => {
    render(<ChangePinModal onClose={vi.fn()} />);

    llenar("4917", "1234", "1234");
    enviar();
    expect(screen.getByRole("alert").textContent).toContain("fácil de adivinar");

    llenar("4917", "8520", "8521");
    enviar();
    expect(screen.getByRole("alert").textContent).toContain("no coinciden");

    llenar("4917", "4917", "4917");
    enviar();
    expect(screen.getByRole("alert").textContent).toContain("distinto del actual");

    expect(service.changePin).not.toHaveBeenCalled();
  });

  it("PIN actual equivocado (el servidor responde false): avisa y deja intentar de nuevo", async () => {
    service.changePin.mockResolvedValue({ data: false, error: null });
    render(<ChangePinModal onClose={vi.fn()} />);
    llenar("1111", "8520", "8520");
    enviar();

    expect((await screen.findByRole("alert")).textContent).toBe("El PIN actual no es correcto.");
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("PIN nuevo") as HTMLInputElement).value).toBe("8520");
  });

  it("tras 5 fallos el servidor bloquea: se avisa que espere 15 minutos", async () => {
    service.changePin.mockResolvedValue({ data: null, error: { message: "PIN_BLOQUEADO" } });
    render(<ChangePinModal onClose={vi.fn()} />);
    llenar("1111", "8520", "8520");
    enviar();

    expect((await screen.findByRole("alert")).textContent).toContain("15 minutos");
  });

  it("un error de red avisa en general (sin mostrar el mensaje técnico)", async () => {
    service.changePin.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    render(<ChangePinModal onClose={vi.fn()} />);
    llenar("4917", "8520", "8520");
    enviar();

    const alerta = (await screen.findByRole("alert")).textContent ?? "";
    expect(alerta).toContain("No se pudo cambiar el PIN");
    expect(alerta).not.toContain("Failed to fetch");
  });

  it("mientras se envía no se puede enviar dos veces ni cerrar", async () => {
    let resolver: (v: { data: boolean; error: null }) => void = () => {};
    service.changePin.mockReturnValue(new Promise((r) => { resolver = r; }));
    const onClose = vi.fn();
    render(<ChangePinModal onClose={onClose} />);
    llenar("4917", "8520", "8520");
    enviar();

    const boton = await screen.findByRole("button", { name: "Cambiando..." });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolver({ data: true, error: null });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(service.changePin).toHaveBeenCalledTimes(1);
  });

  it("Cancelar, Escape y Cerrar (tras el éxito) cierran el diálogo", async () => {
    const onClose = vi.fn();
    render(<ChangePinModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    llenar("4917", "8520", "8520");
    enviar();
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
