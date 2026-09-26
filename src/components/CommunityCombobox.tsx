"use client";

import { useEffect, useRef, useState } from "react";

interface CommunityComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}

export default function CommunityCombobox({ value, onChange, suggestions, placeholder = "Escriba el nombre de la comunidad" }: CommunityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = value.trim() === ""
    ? suggestions
    : suggestions.filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()));

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        className="input-field"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />

      {isOpen && filtered.length > 0 && (
        <ul className="custom-select__menu" role="listbox" style={{ position: "absolute", left: 0, right: 0 }}>
          {filtered.map((name) => (
            <li
              key={name}
              role="option"
              aria-selected={name === value}
              className={`custom-select__option ${name === value ? "custom-select__option--selected" : ""}`}
              onClick={() => {
                onChange(name);
                setIsOpen(false);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
