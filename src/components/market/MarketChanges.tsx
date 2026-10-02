"use client";

import { useEffect, useRef, useState } from "react";
import CustomSelect from "@/components/CustomSelect";
import { MAX_CHANGES, MAX_CHANGE_TEXT } from "@/lib/marketList";
import type { MarketChange, MarketItem, MarketReply } from "@/types/market";

// Zona de cambios de un tipo de lista (plan 008): notas como «pescado por pechuga» que viajan con el pedido y que
// la nutricionista ve junto a lo pedido. Cada nota puede ir ligada a un producto o ser general.
export default function MarketChanges({
  kindLabel,
  items,
  changes,
  disabled,
  open,
  onToggle,
  prefillItemId,
  focusNonce,
  replies,
  onSeen,
  onAdd,
  onUpdate,
  onRemove,
}: {
  kindLabel: string;
  items: MarketItem[];
  changes: MarketChange[];
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  // Producto que se eligió con el 📝 de una fila; `focusNonce` cambia cada vez que se pulsa uno.
  prefillItemId: string | null;
  focusNonce: number;
  // Respuestas de la nutricionista a las notas de este tipo; `onSeen` se llama cuando la persona las tuvo a la vista.
  replies: MarketReply[];
  onSeen: () => void;
  // Devuelven un aviso si no se pudo (vacía, o ya hay 20), o null si quedó bien.
  onAdd: (itemId: string | null, text: string) => string | null;
  onUpdate: (id: string, text: string) => string | null;
  onRemove: (id: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // El 📝 de un producto elige ese producto (se ajusta durante el render, no en un efecto)...
  const [seenNonce, setSeenNonce] = useState(focusNonce);
  if (focusNonce !== seenNonce) {
    setSeenNonce(focusNonce);
    setItemId(prefillItemId ?? "");
  }

  // ...y deja el cursor listo para escribir. Al montar con un nonce viejo (cambio de pestaña) no se enfoca nada.
  const handledNonce = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce === handledNonce.current) return;
    handledNonce.current = focusNonce;
    inputRef.current?.focus();
    boxRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [focusNonce]);

  // Si hay respuestas sin leer y la zona está abierta (se están viendo), se marcan como leídas tras un momento.
  const hasUnseen = changes.some((c) => replies.some((r) => r.change_id === c.id && !r.seen));
  const onSeenRef = useRef(onSeen);
  useEffect(() => {
    onSeenRef.current = onSeen;
  });
  useEffect(() => {
    if (!open || !hasUnseen) return;
    const timer = setTimeout(() => onSeenRef.current(), 1500);
    return () => clearTimeout(timer);
  }, [open, hasUnseen]);

  // La lista de productos usa el mismo desplegable de toda la app (no el del navegador, que se abre enorme y sin estilo).
  const productOptions = [{ value: "", label: "Sin producto (nota general)" }, ...items.map((i) => ({ value: i.id, label: i.name }))];
  const itemName = (id: string | null) => (id ? items.find((i) => i.id === id)?.name ?? "Producto" : null);
  const full = changes.length >= MAX_CHANGES;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = onAdd(itemId || null, text);
    setError(problem);
    if (!problem) {
      setText("");
      setItemId("");
    }
  };

  const startEdit = (change: MarketChange) => {
    setEditingId(change.id);
    setEditText(change.text);
    setEditError(null);
  };

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const problem = onUpdate(editingId, editText);
    setEditError(problem);
    if (!problem) setEditingId(null);
  };

  return (
    <div className="market-changes" ref={boxRef}>
      <button
        type="button"
        className="btn btn-outline market-changes-toggle"
        aria-expanded={open}
        aria-controls="market-changes-body"
        onClick={onToggle}
      >
        <span aria-hidden="true">📝</span> Cambios del pedido de {kindLabel.toLowerCase()}
        {changes.length > 0 && <span className="market-tab-count" aria-label={`${changes.length} cambios`}>{changes.length}</span>}
        <span className="market-changes-arrow" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div id="market-changes-body" className="market-changes-body">
          <p className="market-changes-help">
            Si necesitas cambiar un producto por otro o dejar una indicación (por ejemplo: «pescado por pechuga»), escríbela aquí.
            Viaja con la lista y la nutricionista la ve junto a lo que pediste. No escribas nombres de personas.
          </p>

          <form className="market-changes-form" onSubmit={handleAdd}>
            <label htmlFor="change-item" className="market-changes-label">Producto (opcional)</label>
            <CustomSelect
              id="change-item"
              options={productOptions}
              value={itemId}
              disabled={disabled || full}
              onChange={setItemId}
            />

            <label htmlFor="change-text" className="market-changes-label">Cambio</label>
            <div className="market-changes-row">
              <input
                id="change-text"
                ref={inputRef}
                type="text"
                className="input-field"
                maxLength={MAX_CHANGE_TEXT}
                autoComplete="off"
                placeholder="Ej: cambiar pescado por pechuga"
                value={text}
                disabled={disabled || full}
                onChange={(e) => { setText(e.target.value); setError(null); }}
              />
              <button type="submit" className="btn btn-primary" disabled={disabled || full}>Agregar cambio</button>
            </div>
            <p className="market-changes-count" aria-live="polite">
              {text.length}/{MAX_CHANGE_TEXT} caracteres · {changes.length} de {MAX_CHANGES} cambios
            </p>
            {error && <p role="alert" className="kardex-submit-error">{error}</p>}
            {full && !error && <p role="status" className="kardex-submit-warn">Llegaste al máximo de {MAX_CHANGES} cambios: quita alguno para agregar otro.</p>}
          </form>

          {changes.length === 0 ? (
            <p className="market-empty">Aún no hay cambios en esta lista.</p>
          ) : (
            <ul className="market-changes-list" aria-label={`Cambios del pedido de ${kindLabel.toLowerCase()}`}>
              {changes.map((change) => {
                const name = itemName(change.item_id);
                const reply = replies.find((r) => r.change_id === change.id);
                return (
                  <li key={change.id} className="market-change">
                    <span className="market-change-chip">{name ?? "General"}</span>
                    {editingId === change.id ? (
                      <form className="market-changes-row" onSubmit={saveEdit}>
                        <input
                          type="text"
                          className="input-field"
                          aria-label="Editar el cambio"
                          maxLength={MAX_CHANGE_TEXT}
                          autoComplete="off"
                          value={editText}
                          autoFocus
                          onChange={(e) => { setEditText(e.target.value); setEditError(null); }}
                        />
                        <button type="submit" className="btn btn-primary" disabled={disabled}>Guardar</button>
                        <button type="button" className="btn btn-outline" onClick={() => setEditingId(null)}>Cancelar</button>
                      </form>
                    ) : (
                      <>
                        <span className="market-change-text">{change.text}</span>
                        <span className="market-change-actions">
                          <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => startEdit(change)} aria-label={`Editar el cambio: ${change.text}`}>Editar</button>
                          <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => onRemove(change.id)} aria-label={`Quitar el cambio: ${change.text}`}>Quitar</button>
                        </span>
                      </>
                    )}
                    {editingId === change.id && editError && <p role="alert" className="kardex-submit-error">{editError}</p>}
                    {reply && (
                      <div className={`market-reply ${reply.seen ? "" : "market-reply--new"}`}>
                        <span className="market-reply-label">
                          <span aria-hidden="true">💬</span> Respuesta de la nutricionista
                          {!reply.seen && <span className="market-reply-new"> · nueva</span>}
                        </span>
                        <span className="market-reply-text">{reply.text}</span>
                        {reply.change_text !== change.text && (
                          <span className="market-reply-old">Respondió a una versión anterior de esta nota: «{reply.change_text}».</span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
