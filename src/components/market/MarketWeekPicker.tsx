"use client";

import { addDays, weekLabel } from "@/lib/marketCalendar";
import { formatDeadline } from "@/lib/marketList";
import { MARKET_KIND_LABEL, type MarketKind } from "@/lib/marketCalendar";

const FRIDAY_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "viernes 2 de octubre"
const fridayText = (iso: string) => `viernes ${Number(iso.slice(8, 10))} de ${FRIDAY_NAMES[Number(iso.slice(5, 7)) - 1]}`;

// Selector de la semana de entrega y resumen de qué se pide ese viernes y hasta cuándo.
export default function MarketWeekPicker({
  weekStart,
  friday,
  kindsDue,
  deadlineAt,
  isUpcoming,
  now,
  onChange,
  onGoToUpcoming,
}: {
  weekStart: string;
  friday: string;
  kindsDue: MarketKind[];
  deadlineAt: string;
  // true si la semana elegida ya es la del próximo pedido.
  isUpcoming: boolean;
  // Hora actual en milisegundos (se refresca sola, ver useNow).
  now: number;
  onChange: (weekStart: string) => void;
  onGoToUpcoming: () => void;
}) {
  const pastDeadline = now > new Date(deadlineAt).getTime();

  return (
    <section className="card market-week" aria-labelledby="market-week-title">
      <div className="market-week-row">
        <button type="button" className="btn btn-outline market-week-arrow" onClick={() => onChange(addDays(weekStart, -7))} aria-label="Semana anterior">
          ←
        </button>
        <div className="market-week-label">
          <h3 id="market-week-title" className="market-week-title">{weekLabel(weekStart)}</h3>
          <p className="market-week-sub">Pedido del {fridayText(friday)}</p>
        </div>
        <button type="button" className="btn btn-outline market-week-arrow" onClick={() => onChange(addDays(weekStart, 7))} aria-label="Semana siguiente">
          →
        </button>
      </div>

      {!isUpcoming && (
        <button type="button" className="btn btn-toggle market-week-upcoming" onClick={onGoToUpcoming}>
          Ir a la semana del próximo pedido
        </button>
      )}

      <p className="market-week-due">
        <strong>Ese viernes se pide:</strong>{" "}
        {kindsDue.map((kind) => MARKET_KIND_LABEL[kind]).join(", ")}.
      </p>
      <p className={`market-week-deadline ${pastDeadline ? "market-week-deadline--late" : ""}`}>
        {/* La fecha ya termina en "p. m.": por eso no se le agrega otro punto. */}
        {pastDeadline
          ? `Plazo vencido (${formatDeadline(deadlineAt)}). Aun así puedes enviarla: quedará marcada como tardía.`
          : `Envíala a más tardar el ${formatDeadline(deadlineAt)}`}
      </p>
    </section>
  );
}
