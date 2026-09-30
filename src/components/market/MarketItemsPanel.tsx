"use client";

import { memo, useMemo, useState } from "react";
import { MARKET_KINDS, MARKET_KIND_LABEL, type MarketKind } from "@/lib/marketCalendar";
import { countOrdered, cleanQuantities, filterItems, type KindDrafts } from "@/lib/marketList";
import type { MarketItem } from "@/types/market";

const Row = memo(function Row({
  item,
  value,
  disabled,
  onChange,
}: {
  item: MarketItem;
  value: string;
  disabled: boolean;
  onChange: (itemId: string, raw: string) => void;
}) {
  const ordered = value !== "" && Number(value.replace(",", ".")) > 0;
  return (
    <li className={`market-item ${ordered ? "market-item--ordered" : ""}`}>
      <label htmlFor={`mq-${item.id}`} className="market-item-label">
        <span className="market-item-name">
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
}: {
  itemsByKind: Record<MarketKind, MarketItem[]>;
  drafts: KindDrafts;
  kindsDue: MarketKind[];
  disabled: boolean;
  onQuantityChange: (kind: MarketKind, itemId: string, raw: string) => void;
}) {
  const [kind, setKind] = useState<MarketKind>("fruver");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => filterItems(itemsByKind[kind], query), [itemsByKind, kind, query]);
  const due = kindsDue.includes(kind);
  const handleChange = useMemo(() => (id: string, raw: string) => onQuantityChange(kind, id, raw), [kind, onQuantityChange]);

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
              <Row key={item.id} item={item} value={drafts[kind][item.id] ?? ""} disabled={disabled} onChange={handleChange} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
