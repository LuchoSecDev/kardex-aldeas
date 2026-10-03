// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevErrorGroup, DevErrorReport, DevErrorSummary } from "@/types/dev";

// La pantalla /dev (plan 007, B1): el panel con los problemas explicados y el flujo de entrada. El servicio se reemplaza por uno falso;
// los mensajes de error (devErrorMessage) y la sesión (devSession) son los de verdad.
vi.mock("@/lib/devService", async (original) => {
  const real = await original<typeof import("@/lib/devService")>();
  return {
    ...real,
    devService: { login: vi.fn(), changePassword: vi.fn(), logout: vi.fn(), summary: vi.fn(), groups: vi.fn(), detail: vi.fn(), resolve: vi.fn() },
  };
});

import DevPanel from "@/components/dev/DevPanel";
import DevPage from "@/app/dev/page";
import { devService } from "@/lib/devService";
import { devSession } from "@/lib/devSession";

const service = vi.mocked(devService, true);
const NOW = Date.parse("2026-10-02T17:00:00Z"); // 12:00 en Colombia

const A: DevErrorGroup = {
  community: "Maná", fn: "kardex_save_product", source: "rpc", level: "warning", code: null, total: 3, open_count: 3,
  first_seen: "2026-10-02T14:00:00Z", last_seen: "2026-10-02T16:59:00Z", last_message: "TypeError: Failed to fetch", last_version: "abc1234",
};
const B: DevErrorGroup = {
  community: "Fortaleza", fn: "market_list_submit", source: "rpc", level: "error", code: "P0001", total: 5, open_count: 2,
  first_seen: "2026-10-01T15:00:00Z", last_seen: "2026-10-02T15:00:00Z", last_message: "Cambios inválidos", last_version: "def5678",
};
const C: DevErrorGroup = {
  community: "Renacer", fn: "kardex_load_month", source: "rpc", level: "warning", code: null, total: 2, open_count: 0,
  first_seen: "2026-10-02T10:00:00Z", last_seen: "2026-10-02T11:00:00Z", last_message: "ya resuelto", last_version: "abc1234",
};
const SUMMARY: DevErrorSummary = { open_errors: 2, open_warnings: 3, communities: 2, last_report_at: "2026-10-02T16:59:00Z" };
const REPORTS: DevErrorReport[] = [
  { id: 3, created_at: "2026-10-02T16:59:00Z", message: "sin red, el más reciente", app_version: "abc1234", resolved: false },
  { id: 2, created_at: "2026-10-02T15:00:00Z", message: "TypeError: Failed to fetch", app_version: "abc1234", resolved: true },
];
const ok = <T,>(data: T) => ({ data, error: null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  service.summary.mockResolvedValue(ok(SUMMARY) as never);
  service.groups.mockResolvedValue(ok([A, B]) as never);
  service.detail.mockResolvedValue(ok(REPORTS) as never);
  service.resolve.mockResolvedValue(ok(3) as never);
  service.login.mockResolvedValue(ok({ token: "tok-dev", must_change: false }) as never);
  service.changePassword.mockResolvedValue(ok({ ok: true }) as never);
  service.logout.mockResolvedValue(undefined as never);
});
afterEach(() => {
  cleanup();
  devSession.set(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const renderPanel = async () => {
  const view = render(<DevPanel notice={null} onChangePassword={vi.fn()} onLogout={vi.fn()} />);
  await waitFor(() => expect(service.groups).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText("Cargando...")).toBeNull());
  return view;
};
const card = (title: string) => screen.getByText(title).closest("li")!;
const cardValue = (label: string) => screen.getByText(label).parentElement!.querySelector(".dev-card-n")!.textContent;
const TITLE_A = "Maná: No se pudo guardar un cambio del kardex.";
const TITLE_B = "Fortaleza: No se pudo enviar el pedido semanal.";

describe("el panel: lo que se rompió, explicado", () => {
  it("las tarjetas de arriba muestran los números, la última hora (de Colombia) y hace cuánto", async () => {
    await renderPanel();
    expect(cardValue("Errores sin resolver")).toBe("2");
    expect(cardValue("Advertencias sin resolver")).toBe("3");
    expect(cardValue("Comunidades afectadas")).toBe("2");
    expect(cardValue("Último reporte (hace 1 min)")).toBe("2026-10-02 11:59");
  });

  it("cada problema se explica en lenguaje natural, con su contador, sus horas y su versión", async () => {
    await renderPanel();
    const a = card(TITLE_A);
    expect(a.textContent).toContain("Advertencia");
    expect(a.textContent).toContain("3 veces · primera 2026-10-02 09:00 · última 2026-10-02 11:59 (hace 1 min) · versión abc1234");
    expect(within(a).getByText("Parece un problema de conexión a internet: la llamada no llegó al servidor.")).toBeTruthy();
    expect(within(a).getByText("Lo que escribió la colaboradora podría no haberse guardado.")).toBeTruthy();
    expect(a.textContent).toContain("Qué pasó");
    expect(a.textContent).toContain("Riesgo");
    expect(a.textContent).toContain("Qué hacer");

    const b = card(TITLE_B);
    expect(b.textContent).toContain("Error");
    expect(b.textContent).toContain("5 veces (2 sin resolver)");
    expect(within(b).getByText("El servidor rechazó los datos que mandó la app. Es un posible fallo de la app, no de internet.")).toBeTruthy();
  });

  it("un problema resuelto lo dice y ya no ofrece el botón de resolver", async () => {
    service.groups.mockResolvedValue(ok([C]) as never);
    await renderPanel();
    const c = card("Renacer: No se pudo cargar el kardex de un mes.");
    expect(c.textContent).toContain("Resuelto");
    expect(within(c).queryByRole("button", { name: "Marcar como resuelto" })).toBeNull();
  });

  it("sin problemas muestra un mensaje distinto según el filtro", async () => {
    service.groups.mockResolvedValue(ok([]) as never);
    await renderPanel();
    expect(screen.getByText("No hay problemas sin resolver en este periodo.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Solo sin resolver"));
    await waitFor(() => expect(screen.getByText("No hay reportes en este periodo.")).toBeTruthy());
  });

  it("si no se pueden cargar, avisa y no muestra una lista vacía engañosa", async () => {
    service.groups.mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await renderPanel();
    expect(screen.getByRole("alert").textContent).toContain("No se pudieron cargar los problemas");
    expect(screen.queryByText("No hay problemas sin resolver en este periodo.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Problemas" })!.children).toHaveLength(0);
  });
});

describe("filtros y recarga", () => {
  it("empieza con 7 días y solo lo abierto; el periodo y el filtro recargan con lo elegido", async () => {
    await renderPanel();
    expect(service.groups).toHaveBeenLastCalledWith(7, true);
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "30" } });
    await waitFor(() => expect(service.groups).toHaveBeenLastCalledWith(30, true));
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "1" } });
    await waitFor(() => expect(service.groups).toHaveBeenLastCalledWith(1, true));
    fireEvent.click(screen.getByLabelText("Solo sin resolver"));
    await waitFor(() => expect(service.groups).toHaveBeenLastCalledWith(1, false));
    expect(within(screen.getByLabelText("Periodo")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Últimas 24 horas", "Últimos 7 días", "Últimos 30 días"]);
  });

  it("«Actualizar» y volver a la pestaña vuelven a cargar con el mismo filtro", async () => {
    await renderPanel();
    const antes = service.groups.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(service.groups.mock.calls.length).toBe(antes + 1));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(service.groups.mock.calls.length).toBe(antes + 2));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(service.groups.mock.calls.length).toBe(antes + 2);
    expect(service.groups).toHaveBeenLastCalledWith(7, true);
  });
});

describe("detalle técnico", () => {
  it("se carga al abrirlo (una sola vez) y muestra los reportes con su hora y versión", async () => {
    await renderPanel();
    const a = card(TITLE_A);
    fireEvent.click(within(a).getByRole("button", { name: "Ver detalle técnico" }));
    await waitFor(() => expect(within(a).getByText("sin red, el más reciente")).toBeTruthy());
    expect(service.detail).toHaveBeenCalledTimes(1);
    expect(service.detail).toHaveBeenCalledWith(expect.objectContaining({ community: "Maná", fn: "kardex_save_product", level: "warning", code: null }));
    expect(a.textContent).toContain("2026-10-02 11:59");
    expect(a.textContent).toContain("vabc1234");
    expect(a.textContent).toContain("vabc1234 · resuelto");
    expect(a.textContent).toContain("kardex_save_product");

    fireEvent.click(within(a).getByRole("button", { name: "Ocultar detalle técnico" }));
    expect(within(a).queryByText("sin red, el más reciente")).toBeNull();
    fireEvent.click(within(a).getByRole("button", { name: "Ver detalle técnico" }));
    expect(within(a).getByText("sin red, el más reciente")).toBeTruthy();
    expect(service.detail).toHaveBeenCalledTimes(1);
  });

  it("si falla, lo dice; y el código del grupo se ve en el detalle", async () => {
    service.detail.mockResolvedValue({ data: null, error: { message: "x" } } as never);
    await renderPanel();
    const b = card(TITLE_B);
    fireEvent.click(within(b).getByRole("button", { name: "Ver detalle técnico" }));
    await waitFor(() => expect(within(b).getByRole("alert").textContent).toBe("No se pudo cargar el detalle."));
    expect(b.textContent).toContain("código P0001");
  });
});

describe("marcar como resuelto", () => {
  it("pide confirmación diciendo cuántos reportes cierra; cancelar no hace nada", async () => {
    await renderPanel();
    const b = card(TITLE_B);
    fireEvent.click(within(b).getByRole("button", { name: "Marcar como resuelto" }));
    expect(b.textContent).toContain("Se cierran 2 reportes abiertos");
    fireEvent.click(within(b).getByRole("button", { name: "Cancelar" }));
    expect(within(b).queryByText(/Se cierran/)).toBeNull();
    expect(service.resolve).not.toHaveBeenCalled();
  });

  it("al confirmar cierra SOLO ese grupo y recarga la lista", async () => {
    await renderPanel();
    const antes = service.groups.mock.calls.length;
    const a = card(TITLE_A);
    fireEvent.click(within(a).getByRole("button", { name: "Marcar como resuelto" }));
    expect(a.textContent).toContain("Se cierran 3 reportes abiertos");
    fireEvent.click(within(a).getByRole("button", { name: "Sí, marcar como resuelto" }));
    await waitFor(() => expect(service.resolve).toHaveBeenCalledTimes(1));
    expect(service.resolve).toHaveBeenCalledWith(expect.objectContaining({ community: "Maná", fn: "kardex_save_product", source: "rpc", level: "warning", code: null }));
    await waitFor(() => expect(service.groups.mock.calls.length).toBe(antes + 1));
  });

  it("si falla, avisa y deja el problema como estaba (con la confirmación abierta para reintentar)", async () => {
    service.resolve.mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    await renderPanel();
    const antes = service.groups.mock.calls.length;
    const a = card(TITLE_A);
    fireEvent.click(within(a).getByRole("button", { name: "Marcar como resuelto" }));
    fireEvent.click(within(a).getByRole("button", { name: "Sí, marcar como resuelto" }));
    await waitFor(() => expect(within(a).getByRole("alert").textContent).toContain("No se pudo marcar como resuelto"));
    expect(service.groups.mock.calls.length).toBe(antes);
    expect(within(a).getByRole("button", { name: "Sí, marcar como resuelto" })).toBeTruthy();
  });
});

describe("la entrada a /dev", () => {
  const login = async (password = "una-clave-larga-1") => {
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  };

  it("sin enlaces: ni «olvidé mi contraseña» (no hay código de recuperación) ni uno de regreso", () => {
    render(<DevPage />);
    expect(screen.getByRole("heading", { name: "Panel del desarrollador" })).toBeTruthy();
    expect(screen.queryByText(/olvid/i)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("una contraseña incorrecta o un bloqueo se avisan sin revelar nada más", async () => {
    render(<DevPage />);
    service.login.mockResolvedValueOnce({ data: null, error: null } as never);
    await login("mala");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Contraseña incorrecta."));
    expect(devSession.get()).toBeNull();

    service.login.mockResolvedValueOnce({ data: null, error: { message: "DEV_BLOQUEADO" } } as never);
    await login("otra");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("15 minutos"));
    service.login.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch" } } as never);
    await login("otra");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Revisa tu conexión"));
  });

  it("entrar guarda el token solo en memoria y abre el panel; cerrar sesión lo borra y vuelve al login", async () => {
    render(<DevPage />);
    await login();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy());
    expect(service.login).toHaveBeenCalledWith("una-clave-larga-1");
    expect(devSession.get()).toBe("tok-dev");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy());
    expect(service.logout).toHaveBeenCalledTimes(1);
  });

  it("con la contraseña temporal obliga a crear una propia: mínimo 12, las dos iguales, y la actual es la que escribió al entrar", async () => {
    service.login.mockResolvedValueOnce(ok({ token: "tok-dev", must_change: true }) as never);
    render(<DevPage />);
    await login("temporal-larga-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Crea tu contraseña" })).toBeTruthy());
    expect(screen.queryByLabelText("Contraseña actual")).toBeNull();

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "corta-11chr" } });
    fireEvent.change(screen.getByLabelText("Confirma la nueva contraseña"), { target: { value: "corta-11chr" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(screen.getByRole("alert").textContent).toContain("al menos 12 caracteres");

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "clave-nueva-larga" } });
    fireEvent.change(screen.getByLabelText("Confirma la nueva contraseña"), { target: { value: "clave-nueva-OTRA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(screen.getByRole("alert").textContent).toContain("no coinciden");
    expect(service.changePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirma la nueva contraseña"), { target: { value: "clave-nueva-larga" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    await waitFor(() => expect(service.changePassword).toHaveBeenCalledWith("temporal-larga-1", "clave-nueva-larga"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Contraseña actualizada."));
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  it("si el servidor dice que la contraseña actual no coincide, lo muestra y se queda en el formulario", async () => {
    service.login.mockResolvedValueOnce(ok({ token: "tok-dev", must_change: true }) as never);
    service.changePassword.mockResolvedValueOnce(ok({ ok: false }) as never);
    render(<DevPage />);
    await login("temporal-larga-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Crea tu contraseña" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "clave-nueva-larga" } });
    fireEvent.change(screen.getByLabelText("Confirma la nueva contraseña"), { target: { value: "clave-nueva-larga" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("La contraseña actual no es correcta."));
    expect(screen.getByRole("heading", { name: "Crea tu contraseña" })).toBeTruthy();
  });

  it("desde el panel se puede cambiar la contraseña (pide la actual, debe ser distinta) o cancelar", async () => {
    render(<DevPage />);
    await login();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(screen.getByRole("heading", { name: "Cambiar contraseña" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Contraseña actual"), { target: { value: "una-clave-larga-1" } });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), { target: { value: "una-clave-larga-1" } });
    fireEvent.change(screen.getByLabelText("Confirma la nueva contraseña"), { target: { value: "una-clave-larga-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(screen.getByRole("alert").textContent).toContain("distinta de la actual");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  it("una sesión vencida o cerrada desde otro lugar devuelve al login con un aviso y sin dejar el token", async () => {
    render(<DevPage />);
    await login();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy());
    act(() => devSession.notifyExpired());
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tu sesión venció. Vuelve a entrar con tu contraseña."));
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(devSession.get()).toBeNull();
  });
});
