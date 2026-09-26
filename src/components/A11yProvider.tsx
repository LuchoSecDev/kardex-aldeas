"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type TextSize = "normal" | "large" | "xl";

interface A11yContextType {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
}

const A11yContext = createContext<A11yContextType | undefined>(undefined);

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    // Add or remove classes to body
    document.body.classList.remove("text-size-normal", "text-size-large", "text-size-xl");
    document.body.classList.add(`text-size-${textSize}`);

    if (highContrast) {
      document.body.classList.add("high-contrast");
    } else {
      document.body.classList.remove("high-contrast");
    }
  }, [textSize, highContrast]);

  return (
    <A11yContext.Provider value={{ textSize, setTextSize, highContrast, setHighContrast }}>
      <div className="a11y-panel">
        <span style={{ fontSize: "0.875rem", marginRight: "8px" }}>Accesibilidad visual:</span>
        <button 
          className={`a11y-btn ${textSize === 'normal' ? 'active' : ''}`} 
          onClick={() => setTextSize("normal")}
          title="Tamaño normal"
        >A</button>
        <button 
          className={`a11y-btn ${textSize === 'large' ? 'active' : ''}`} 
          onClick={() => setTextSize("large")}
          title="Tamaño grande"
        >A+</button>
        <button 
          className={`a11y-btn ${textSize === 'xl' ? 'active' : ''}`} 
          onClick={() => setTextSize("xl")}
          title="Tamaño extra grande"
        >A++</button>
        
        <div style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.3)", margin: "0 8px" }}></div>
        
        <button 
          className={`a11y-btn ${highContrast ? 'active' : ''}`} 
          onClick={() => setHighContrast(!highContrast)}
          title="Modo alto contraste"
        >
          {highContrast ? "Contraste Normal" : "Alto Contraste"}
        </button>
      </div>
      {children}
    </A11yContext.Provider>
  );
}

export function useA11y() {
  const context = useContext(A11yContext);
  if (!context) throw new Error("useA11y must be used within A11yProvider");
  return context;
}
