"use client";

import { useState } from "react";

// La nutricionista responde a una nota de cambio de la comunidad (p. ej. «pescado por pechuga» -> «Se envía pechuga»).
// Una respuesta por nota, de hasta 200 caracteres; se puede editar o quitar. La comunidad la ve junto a su nota y recibe
// una campanita.
export const MAX_REPLY_TEXT = 200;

export default function AdminChangeReply({
  reply,
  busy,
  onSave,
}: {
  reply: { text: string; at: string } | null;
  busy: boolean;
  // Devuelve true si se guardó (un texto vacío QUITA la respuesta).
  onSave: (text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const open = () => {
    setText(reply?.text ?? "");
    setEditing(true);
  };

  const save = async (value: string) => {
    if (await onSave(value)) setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="admin-reply-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() !== "") void save(text);
        }}
      >
        <label className="sr-only" htmlFor="admin-reply-text">Respuesta a este cambio</label>
        <input
          id="admin-reply-text"
          type="text"
          className="input-field"
          maxLength={MAX_REPLY_TEXT}
          autoComplete="off"
          autoFocus
          placeholder="Ej: Se envía pechuga, no hay pescado"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="admin-reply-count">{text.length}/{MAX_REPLY_TEXT}</span>
        <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ""}>
          {busy ? "Enviando…" : "Enviar respuesta"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button>
      </form>
    );
  }

  if (reply) {
    return (
      <div className="admin-reply">
        <span className="admin-reply-label"><span aria-hidden="true">💬</span> Tu respuesta:</span>{" "}
        <span className="admin-reply-text">{reply.text}</span>
        <span className="admin-reply-actions">
          <button type="button" className="btn btn-outline" onClick={open} disabled={busy}>Editar respuesta</button>
          <button type="button" className="btn btn-outline" onClick={() => void save("")} disabled={busy}>Quitar</button>
        </span>
      </div>
    );
  }

  return (
    <div className="admin-reply">
      <button type="button" className="btn btn-outline" onClick={open} disabled={busy}>Responder</button>
    </div>
  );
}
