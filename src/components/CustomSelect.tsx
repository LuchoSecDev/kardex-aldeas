"use client";

import React, { useState, useRef, useEffect, useId } from "react";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  // Para enlazarlo con un <label htmlFor="..."> (un botón se puede etiquetar igual que un campo).
  id?: string;
  disabled?: boolean;
}

// Se puede escribir para saltar a una opción (como en una lista nativa); el texto escrito se olvida tras este tiempo.
const TYPEAHEAD_MS = 700;

export default function CustomSelect({
  options, value, onChange, placeholder = "Seleccione...", style, className, id, disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  // Lo escrito para saltar a una opción; se borra solo tras una pausa (TYPEAHEAD_MS).
  const typed = useRef<{ text: string; timer?: ReturnType<typeof setTimeout> }>({ text: "" });
  const uid = useId();

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  const open = () => {
    if (disabled) return;
    const selected = options.findIndex(o => o.value === value);
    setActiveIndex(selected >= 0 ? selected : 0);
    setIsOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Al abrir, el foco pasa a la lista para poder usar el teclado.
  useEffect(() => {
    if (isOpen) menuRef.current?.focus();
  }, [isOpen]);

  // La opción activa siempre queda a la vista (la lista tiene scroll).
  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(`${uid}-opt-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex, uid]);

  const handleMenuKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    // Mientras se está escribiendo una búsqueda, el espacio es parte del texto («banano u…»), no «elegir».
    const searching = typed.current.text !== "";
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActiveIndex(i => Math.min(i + 1, last)); return;
      case "ArrowUp": e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return;
      case "Home": e.preventDefault(); setActiveIndex(0); return;
      case "End": e.preventDefault(); setActiveIndex(last); return;
      case "Enter": e.preventDefault(); choose(activeIndex); return;
      case " ":
        e.preventDefault(); // también evita que la barra espaciadora desplace la página
        if (!searching) { choose(activeIndex); return; }
        break;
      case "Escape": e.preventDefault(); close(true); return;
      case "Tab": setIsOpen(false); return;
    }
    // Escribir salta a la primera opción que empieza con lo escrito (sin distinguir mayúsculas ni acentos).
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      clearTimeout(typed.current.timer);
      const text = typed.current.text + e.key;
      typed.current = { text, timer: setTimeout(() => { typed.current.text = ""; }, TYPEAHEAD_MS) };
      const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const found = options.findIndex(o => plain(o.label).startsWith(plain(text)));
      if (found >= 0) setActiveIndex(found);
    }
  };

  return (
    <div ref={containerRef} className={`custom-select ${className || ""}`} style={style}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="custom-select__trigger"
        disabled={disabled}
        onClick={() => (isOpen ? close(false) : open())}
        onKeyDown={(e) => {
          // Flecha abajo/arriba abren la lista, como en una lista nativa.
          if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); open(); }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="custom-select__label">{selectedLabel}</span>
        <svg
          className={`custom-select__arrow ${isOpen ? "custom-select__arrow--open" : ""}`}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <ul
          ref={menuRef}
          className="custom-select__menu"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${uid}-opt-${activeIndex}`}
          onKeyDown={handleMenuKey}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${uid}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`custom-select__option ${option.value === value ? "custom-select__option--selected" : ""} ${index === activeIndex ? "custom-select__option--active" : ""}`}
              onClick={() => choose(index)}
            >
              {option.label}
              {option.value === value && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: "auto", flexShrink: 0 }}>
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
