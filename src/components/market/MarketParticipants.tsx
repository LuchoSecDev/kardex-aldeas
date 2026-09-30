"use client";

import { useState } from "react";

// Número fijo de participantes de la comunidad. Solo se cambia cuando llega o se
// va alguien; cada lista que se envía lleva una copia del número vigente.
export default function MarketParticipants({
  participants,
  isSaving,
  onSave,
}: {
  participants: number | null;
  isSaving: boolean;
  onSave: (raw: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const missing = participants === null;
  const showForm = missing || editing;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await onSave(value);
    if (saved) {
      setEditing(false);
      setValue("");
    }
  };

  return (
    <section className="card market-participants" aria-labelledby="market-participants-title">
      <h3 id="market-participants-title" className="market-participants-title">Participantes</h3>
      {showForm ? (
        <form onSubmit={submit} className="market-participants-form">
          <label htmlFor="market-participants-input">
            {missing
              ? "¿Cuántos participantes tiene tu comunidad? Hace falta para poder enviar la lista."
              : "Nuevo número de participantes"}
          </label>
          <div className="market-participants-controls">
            <input
              id="market-participants-input"
              className="input-field market-participants-input"
              inputMode="numeric"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder={missing ? "Ej. 11" : String(participants)}
            />
            <button type="submit" className="btn btn-primary" disabled={isSaving || value === ""}>
              {isSaving ? "Guardando…" : "Guardar"}
            </button>
            {!missing && (
              <button type="button" className="btn btn-outline" onClick={() => { setEditing(false); setValue(""); }}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="market-participants-value">
          Tu comunidad tiene <strong>{participants}</strong> participantes.{" "}
          <button type="button" className="market-link-btn" onClick={() => setEditing(true)}>
            Cambiar (llegó o se fue alguien)
          </button>
        </p>
      )}
    </section>
  );
}
