// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveStatus } from "@/hooks/useSaveQueue";
import type { WeekSubmission } from "@/types/submissions";

vi.mock("@/lib/kardexService", () => ({
  kardexService: { loadWeekSubmissions: vi.fn(), submitWeek: vi.fn() },
}));

import { useWeekSubmissions } from "@/hooks/useWeekSubmissions";
import { kardexService } from "@/lib/kardexService";

const service = vi.mocked(kardexService, true);
const sent = (week_index: number): WeekSubmission =>
  ({ week_index, submitted_at: "2026-09-04T12:00:00Z", submit_count: 1, reviewed: false, modified: false });

type Props = { year: number; month: number; status: SaveStatus; enabled: boolean };
const setup = (props: Props) =>
  renderHook((p: Props) => useWeekSubmissions(p.year, p.month, p.status, p.enabled), { initialProps: props });

const BASE: Props = { year: 2026, month: 8, status: "idle", enabled: true };

describe("useWeekSubmissions: no consulta de más", () => {
  beforeEach(() => {
    service.loadWeekSubmissions.mockReset();
  });
  afterEach(cleanup);

  it("carga al entrar y, si el mes no tiene envíos, los guardados ya no vuelven a consultar", async () => {
    service.loadWeekSubmissions.mockResolvedValue({ data: [], error: null });
    const { rerender } = setup(BASE);
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1));

    for (const status of ["saving", "saved", "saving", "saved"] as SaveStatus[]) {
      rerender({ ...BASE, status });
    }
    await act(async () => {});
    expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1);
  });

  it("si el mes tiene una semana enviada, cada guardado refresca el aviso de 'modificada'", async () => {
    service.loadWeekSubmissions.mockResolvedValue({ data: [sent(0)], error: null });
    const { rerender, result } = setup(BASE);
    await waitFor(() => expect(result.current.submissions).toHaveLength(1));

    rerender({ ...BASE, status: "saving" });
    expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1); // guardando: aún no
    service.loadWeekSubmissions.mockResolvedValue({ data: [{ ...sent(0), modified: true }], error: null });
    rerender({ ...BASE, status: "saved" });
    await waitFor(() => expect(result.current.submissions[0].modified).toBe(true));
    expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(2);
  });

  it("al cambiar de mes vuelve a consultar, aunque el anterior estuviera vacío", async () => {
    service.loadWeekSubmissions.mockResolvedValue({ data: [], error: null });
    const { rerender } = setup(BASE);
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1));

    service.loadWeekSubmissions.mockResolvedValue({ data: [sent(2)], error: null });
    rerender({ ...BASE, month: 9 });
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(2));
    expect(service.loadWeekSubmissions).toHaveBeenLastCalledWith(2026, 9);
  });

  it("tras enviar una semana, los guardados siguientes vuelven a consultar", async () => {
    service.loadWeekSubmissions.mockResolvedValue({ data: [], error: null });
    service.submitWeek.mockResolvedValue({ error: null } as never);
    const { rerender, result } = setup(BASE);
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1));

    service.loadWeekSubmissions.mockResolvedValue({ data: [sent(0)], error: null });
    await act(async () => { await result.current.submit(0); });
    expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(2);
    expect(result.current.submissions).toHaveLength(1);

    rerender({ ...BASE, status: "saved" });
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(3));
  });

  it("al salir y entrar otra comunidad (enabled false → true) no hereda lo aprendido", async () => {
    service.loadWeekSubmissions.mockResolvedValue({ data: [], error: null });
    const { rerender } = setup(BASE);
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(1));

    rerender({ ...BASE, enabled: false });
    rerender({ ...BASE, enabled: true });
    await waitFor(() => expect(service.loadWeekSubmissions).toHaveBeenCalledTimes(2));
  });

  it("no consulta nada mientras está deshabilitado", async () => {
    setup({ ...BASE, enabled: false });
    await act(async () => {});
    expect(service.loadWeekSubmissions).not.toHaveBeenCalled();
  });
});
