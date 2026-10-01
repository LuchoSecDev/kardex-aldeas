"use client";

import { memo, useCallback, useMemo, useState } from "react";
import MarketChanges from "@/components/market/MarketChanges";
import { MARKET_KINDS, MARKET_KIND_LABEL, type MarketKind } from "@/lib/marketCalendar";
import { countOrdered, cleanQuantities, filterItems, type KindDrafts } from "@/lib/marketList";
import type { KindChanges, MarketItem } from "@/types/market";

const Row = memo(function Row({
  item,
  value,
  noteCount,
  disabled,
  onChange,
  onNote,
}: {
  item: MarketItem;
  value: string;
  // Cuántas notas de cambio tiene este producto (plan 008).
  noteCount: number;
  disabled: boolean;
  onChange: (itemId: string, raw: string) => void;
  onNote: (itemId: string) => void;
}) {
  const ordered = value !== "" && Number(value.replace(",", ".")) > 0;
  return (
    <li className={`market-item ${ordered ? "market-item--ordered" : ""}`}>
      <label htmlFor={`mq-${item.id}`} className="market-item-label">
        <span className="market-item-name" id={`mn-${item.id}`}>
          {item.name}
          {item.is_event && <span className="market-item-tag">evento</span>}
        </span>
        <span className="market-item-unit">{item.unit}</span>
      </label>
      <input
        id={`mq-${item.id}`}
        className="input-field market-item-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(item.id, e.target.value)}
      />
      <button
        type="button"
        className={`market-note-btn ${noteCount > 0 ? "market-note-btn--has" : ""}`}
        disabled={disabled}
        aria-label={noteCount > 0 ? `Cambios: ${noteCount}. Agregar otro` : "Agregar un cambio"}
        aria-describedby={`mn-${item.id}`}
        title="Dejar una nota de cambio para este producto"
        onClick={() => onNote(item.id)}
      >
        <span aria-hidden="true">📝</span>
        {noteCount > 0 && <span className="market-note-count" aria-hidden="true">{noteCount}</span>}
      </button>
    </li>
  );
});

// Pestañas por tipo (Fruver y lácteos, Carnes, Abarrotes, Aseo) con buscador y
// un campo de cantidad por ítem.
export default function MarketItemsPanel({
  itemsByKind,
  drafts,
  kindsDue,
  disabled,
  onQuantityChange,
  changes,
  onAddChange,
  onUpdateChange,
  onRemoveChange,
}: {
  itemsByKind: Record<MarketKind, MarketItem[]>;
  drafts: KindDrafts;
  kindsDue: MarketKind[];
  disabled: boolean;
  onQuantityChange: (kind: MarketKind, itemId: string, raw: string) => void;
  changes: KindChanges;
  onAddChange: (kind: MarketKind, itemId: string | null, text: string) => string | null;
  onUpdateChange: (kind: MarketKind, id: string, text: string) => string | null;
  onRemoveChange: (kind: MarketKind, id: string) => void;
}) {
  const [kind, setKind] = useState<MarketKind>("fruver");
  const [query, setQuery] = useState("");
  // La zona de cambios de un tipo se abre sola si ya tiene notas; con el 📝 de un producto se abre y se enfoca.
  const [openOverride, setOpenOverride] = useState<Partial<Record<MarketKind, boolean>>>({});
  const [noteTarget, setNoteTarget] = useState<{ itemId: string | null; nonce: number }>({ itemId: null, nonce: 0 });

  const visible = useMemo(() => filterItems(itemsByKind[kind], query), [itemsByKind, kind, query]);
  const due = kindsDue.includes(kind);
  const handleChange = useMemo(() => (id: string, raw: string) => onQuantityChange(kind, id, raw), [kind, onQuantityChange]);
  const kindChanges = changes[kind];
  const changesOpen = openOverride[kind] ?? kindChanges.length > 0;
  const handleNote = useCallback(
    (itemId: string) => {
      setOpenOverride((current) => ({ ...current, [kind]: true }));
      setNoteTarget((current) => ({ itemId, nonce: current.nonce + 1 }));
    },
    [kind]
  );
  const noteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of kindChanges) if (c.item_id) counts[c.item_id] = (counts[c.item_id] ?? 0) + 1;
    return counts;
  }, [kindChanges]);

  return (
    <section className="card market-items" aria-label="Productos de la lista">
      <div className="market-tabs" role="tablist" aria-label="Tipo de lista">
        {MARKET_KINDS.map((k) => {
          const count = countOrdered(cleanQuantities(drafts[k]));
          return (
            <button
              key={k}
              type="button"
              role="tab"
              id={`market-tab-${k}`}
              aria-selected={kind === k}
              aria-controls="market-panel"
              className={`btn btn-toggle market-tab ${kind === k ? "btn-primary" : ""}`}
              onClick={() => { setKind(k); setQuery(""); }}
            >
              {MARKET_KIND_LABEL[k]}
              {count > 0 && <span className="market-tab-count" aria-label={`${count} pedidos`}>{count}</span>}
              {changes[k].length > 0 && <span className="market-tab-notes" aria-label={`${changes[k].length} cambios`}>📝{changes[k].length}</span>}
              {!kindsDue.includes(k) && <span className="market-tab-off" title="Este viernes no toca">·</span>}
            </button>
          );
        })}
      </div>

      <div id="market-panel" role="tabpanel" aria-labelledby={`market-tab-${kind}`}>
        <p className={`market-due ${due ? "market-due--yes" : "market-due--no"}`}>
          {due
            ? `✓ Este viernes SÍ se pide ${MARKET_KIND_LABEL[kind].toLowerCase()}.`
            : `Este viernes no toca pedir ${MARKET_KIND_LABEL[kind].toLowerCase()}. Déjalo en blanco; si necesitas pedir algo igual, puedes hacerlo.`}
        </p>

        <MarketChanges
          key={kind}
          kindLabel={MARKET_KIND_LABEL[kind]}
          items={itemsByKind[kind]}
          changes={kindChanges}
          disabled={disabled}
          open={changesOpen}
          onToggle={() => setOpenOverride((current) => ({ ...current, [kind]: !changesOpen }))}
          prefillItemId={noteTarget.itemId}
          focusNonce={noteTarget.nonce}
          onAdd={(itemId, text) => onAddChange(kind, itemId, text)}
          onUpdate={(id, text) => onUpdateChange(kind, id, text)}
          onRemove={(id) => onRemoveChange(kind, id)}
        />

        <input
          type="search"
          className="input-field market-search"
          placeholder={`Buscar en ${MARKET_KIND_LABEL[kind].toLowerCase()}…`}
          aria-label="Buscar producto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {itemsByKind[kind].length === 0 ? (
          <p className="market-empty">Cargando productos…</p>
        ) : visible.length === 0 ? (
          <p className="market-empty">Ningún producto coincide con «{query}».</p>
        ) : (
          <ul className="market-item-list">
            {visible.map((item) => (
              <Row key={item.id} item={item} value={drafts[kind][item.id] ?? ""} noteCount={noteCounts[item.id] ?? 0} disabled={disabled} onChange={handleChange} onNote={handleNote} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
